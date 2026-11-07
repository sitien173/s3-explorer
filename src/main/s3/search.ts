import { ListObjectsV2Command, type ListObjectsV2CommandOutput, type S3Client } from "@aws-sdk/client-s3";

export const MAX_SEARCH_MATCHES = 10_000;

export interface SearchMatch {
	key: string;
	size: number;
	lastModified?: string;
	etag?: string;
}

export interface SearchOptions {
	bucket: string;
	prefix: string;
	query: string;
	signal?: AbortSignal;
	cap?: number;
}

export interface SearchEmit {
	onBatch: (matches: SearchMatch[]) => void;
	onProgress: (progress: { scanned: number; matched: number }) => void;
}

export interface SearchResult {
	truncated: boolean;
	cancelled: boolean;
}

export function matchesQuery(key: string, prefix: string, query: string): boolean {
	const relativeKey = key.startsWith(prefix) ? key.slice(prefix.length) : key;
	if (relativeKey.length === 0) return false;
	return relativeKey.toLowerCase().includes(query.toLowerCase());
}

export async function runSearch(
	client: Pick<S3Client, "send">,
	options: SearchOptions,
	emit: SearchEmit,
): Promise<SearchResult> {
	const cap = options.cap ?? MAX_SEARCH_MATCHES;
	const signal = options.signal;

	let scanned = 0;
	let matched = 0;
	let continuationToken: string | undefined;
	let truncated = false;

	while (true) {
		if (signal?.aborted) {
			return { truncated: false, cancelled: true };
		}

		const command: ListObjectsV2Command = new ListObjectsV2Command({
			Bucket: options.bucket,
			Prefix: options.prefix,
			MaxKeys: 1000,
			ContinuationToken: continuationToken,
		});

		let response: ListObjectsV2CommandOutput;
		try {
			response = (await client.send(
				command,
				signal ? { abortSignal: signal } : undefined,
			)) as ListObjectsV2CommandOutput;
		} catch (error) {
			if (signal?.aborted) {
				return { truncated: false, cancelled: true };
			}
			throw error;
		}

		if (signal?.aborted) {
			return { truncated: false, cancelled: true };
		}

		const batchMatches: SearchMatch[] = [];
		const contents = response.Contents ?? [];

		for (const item of contents) {
			scanned++;
			const key = item.Key ?? "";
			if (matchesQuery(key, options.prefix, options.query)) {
				if (matched >= cap) {
					truncated = true;
					break;
				}
				matched++;
				const match: SearchMatch = {
					key,
					size: item.Size ?? 0,
				};
				if (item.LastModified) {
					match.lastModified = item.LastModified.toISOString();
				}
				if (item.ETag !== undefined) {
					match.etag = item.ETag;
				}
				batchMatches.push(match);
			}
		}

		if (signal?.aborted) {
			return { truncated: false, cancelled: true };
		}

		if (batchMatches.length > 0) {
			emit.onBatch(batchMatches);
		}

		if (signal?.aborted) {
			return { truncated: false, cancelled: true };
		}

		emit.onProgress({ scanned, matched });

		if (truncated) {
			return { truncated: true, cancelled: false };
		}

		if (response.IsTruncated && response.NextContinuationToken) {
			continuationToken = response.NextContinuationToken;
		} else {
			break;
		}
	}

	return { truncated: false, cancelled: false };
}
