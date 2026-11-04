import {
	CopyObjectCommand,
	DeleteObjectCommand,
	DeleteObjectsCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	type S3Client,
} from "@aws-sdk/client-s3";
import { mapS3Error, throwMappedError, toErrorCode } from "../ipc/browse";

export const MAX_COPY_BYTES = 5 * 1024 ** 3;

type Client = Pick<S3Client, "send">;
type Failure = {
	completed: string[];
	remaining: string[];
	error?: ReturnType<typeof mapS3Error>;
};

export function batchKeys(keys: string[]): string[][] {
	const unique = [...new Set(keys)];
	const batches: string[][] = [];
	for (let i = 0; i < unique.length; i += 1000) {
		batches.push(unique.slice(i, i + 1000));
	}
	return batches;
}

export function mapPrefixKey(
	key: string,
	fromPrefix: string,
	toPrefix: string,
): string {
	return toPrefix + key.slice(fromPrefix.length);
}

export function copySource(bucket: string, key: string): string {
	return `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

const coded = (code: string, message: string) =>
	Object.assign(new Error(message), { code });

async function copyThenDelete(
	client: Client,
	bucket: string,
	source: string,
	destination: string,
): Promise<void> {
	let result;
	try {
		result = await client.send(
			new CopyObjectCommand({
				Bucket: bucket,
				Key: destination,
				CopySource: copySource(bucket, source),
			}),
		);
	} catch (error) {
		throwMappedError(error);
	}
	if (
		typeof result.CopyObjectResult?.ETag !== "string" ||
		!result.CopyObjectResult.ETag
	) {
		throw new Error("Copy not confirmed");
	}
	try {
		await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: source }));
	} catch (error) {
		throwMappedError(error);
	}
}

export async function renameObject(
	client: Client,
	bucket: string,
	fromKey: string,
	toKey: string,
): Promise<{ key: string }> {
	if (fromKey === toKey) {
		throw coded("INVALID_REQUEST", "Source and destination are the same");
	}

	let source;
	try {
		source = await client.send(
			new HeadObjectCommand({ Bucket: bucket, Key: fromKey }),
		);
	} catch (error) {
		throwMappedError(error);
	}
	if ((source.ContentLength ?? 0) > MAX_COPY_BYTES) {
		throw coded("TOO_LARGE", "Too large to rename");
	}

	try {
		await client.send(new HeadObjectCommand({ Bucket: bucket, Key: toKey }));
		throw coded("CONFLICT", "Destination exists");
	} catch (error) {
		if ((error as { code?: string }).code === "CONFLICT") throw error;
		if (
			!["NotFound", "NoSuchKey"].includes(
				(error as { name?: string }).name ?? "",
			)
		) {
			throwMappedError(error);
		}
	}

	await copyThenDelete(client, bucket, fromKey, toKey);
	return { key: toKey };
}

async function list(
	client: Client,
	bucket: string,
	prefix: string,
): Promise<{ Key: string; Size: number }[]> {
	const rows: { Key: string; Size: number }[] = [];
	let token: string | undefined;
	do {
		let page;
		try {
			page = await client.send(
				new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: prefix,
					ContinuationToken: token,
				}),
			);
		} catch (error) {
			throwMappedError(error);
		}
		for (const item of page.Contents ?? []) {
			if (item.Key !== undefined)
				rows.push({ Key: item.Key, Size: item.Size ?? 0 });
		}
		token = page.IsTruncated ? page.NextContinuationToken : undefined;
	} while (token);
	return rows;
}

export async function renamePrefix(
	client: Client,
	bucket: string,
	fromPrefix: string,
	toPrefix: string,
	progress?: (done: number, total: number) => void,
): Promise<Failure> {
	if (fromPrefix === toPrefix || toPrefix.startsWith(fromPrefix)) {
		throw coded("INVALID_REQUEST", "Cannot move a folder into itself");
	}

	const sources = await list(client, bucket, fromPrefix);
	if (sources.length === 0) throw coded("NOT_FOUND", "Request failed");
	const destinations = sources.map(({ Key }) =>
		mapPrefixKey(Key, fromPrefix, toPrefix),
	);
	if (sources.some((source) => source.Size > MAX_COPY_BYTES)) {
		throw coded("TOO_LARGE", "Too large to rename");
	}

	const existing = new Set(
		(await list(client, bucket, toPrefix)).map((item) => item.Key),
	);
	if (destinations.some((key) => existing.has(key))) {
		throw coded("CONFLICT", "Destination exists");
	}

	const completed: string[] = [];
	for (let i = 0; i < sources.length; i++) {
		const source = sources[i]!.Key;
		try {
			await copyThenDelete(client, bucket, source, destinations[i]!);
			completed.push(source);
			progress?.(completed.length, sources.length);
		} catch (error) {
			const candidate = error as { code?: unknown; message?: string };
			const code = toErrorCode(candidate?.code);
			const mapped = code
				? { code, message: candidate.message ?? "Request failed" }
				: mapS3Error(error);
			return {
				completed,
				remaining: sources.slice(i).map((item) => item.Key),
				error: mapped,
			};
		}
	}
	return { completed, remaining: [] };
}

export async function deleteKeys(
	client: Client,
	bucket: string,
	keys: string[],
	progress?: (done: number, total: number) => void,
): Promise<Failure> {
	const batches = batchKeys(keys);
	const total = batches.reduce((sum, batch) => sum + batch.length, 0);
	const completed: string[] = [];
	for (let i = 0; i < batches.length; i++) {
		const batch = batches[i]!;
		let output;
		try {
			output = await client.send(
				new DeleteObjectsCommand({
					Bucket: bucket,
					Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: false },
				}),
			);
		} catch (error) {
			progress?.(completed.length, total);
			return {
				completed,
				remaining: [...batch, ...batches.slice(i + 1).flat()],
				error: mapS3Error(error),
			};
		}

		const requested = new Set(batch);
		const deleted = new Set(
			(output.Deleted ?? [])
				.map((item) => item.Key)
				.filter((key): key is string => !!key && requested.has(key)),
		);
		completed.push(...batch.filter((key) => deleted.has(key)));
		progress?.(completed.length, total);
		const remainingBatch = batch.filter((key) => !deleted.has(key));
		if (output.Errors?.length || remainingBatch.length > 0) {
			const firstError = output.Errors?.[0];
			return {
				completed,
				remaining: [...remainingBatch, ...batches.slice(i + 1).flat()],
				error: firstError
					? mapS3Error({ name: firstError.Code, message: firstError.Message })
					: { code: "REQUEST_FAILED", message: "Request failed" },
			};
		}
	}
	return { completed, remaining: [] };
}

export async function deletePrefix(
	client: Client,
	bucket: string,
	prefix: string,
	progress?: (done: number, total: number) => void,
): Promise<Failure> {
	const keys = (await list(client, bucket, prefix)).map((item) => item.Key);
	return deleteKeys(client, bucket, keys, progress);
}

export async function countPrefix(
	client: Client,
	bucket: string,
	prefix: string,
): Promise<number> {
	let count = 0;
	let token: string | undefined;
	do {
		let page;
		try {
			page = await client.send(
				new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: prefix,
					ContinuationToken: token,
				}),
			);
		} catch (error) {
			throwMappedError(error);
		}
		count += page.KeyCount ?? page.Contents?.length ?? 0;
		token = page.IsTruncated ? page.NextContinuationToken : undefined;
	} while (token);
	return count;
}

export async function createFolder(
	client: Client,
	bucket: string,
	key: string,
): Promise<{ key: string }> {
	try {
		await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				Body: "",
				ContentLength: 0,
			}),
		);
		return { key };
	} catch (error) {
		throwMappedError(error);
	}
}
