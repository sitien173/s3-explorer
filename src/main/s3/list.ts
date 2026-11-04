import { ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import type { ObjectsListResponse } from "../../shared/ipc";

export async function listObjects(
	client: Pick<S3Client, "send">,
	options: { bucket: string; prefix?: string; token?: string },
): Promise<ObjectsListResponse> {
	const command = new ListObjectsV2Command({
		Bucket: options.bucket,
		Prefix: options.prefix,
		Delimiter: "/",
		MaxKeys: 1000,
		ContinuationToken: options.token,
	});

	const response = await client.send(command);

	const folders = (response.CommonPrefixes ?? [])
		.map((cp) => cp.Prefix)
		.filter((prefix): prefix is string => typeof prefix === "string");

	const targetPrefix = options.prefix ?? "";
	const objects = (response.Contents ?? [])
		.filter((item) => item.Key !== undefined && item.Key !== targetPrefix)
		.map((item) => {
			const obj: {
				key: string;
				size: number;
				lastModified?: string;
				etag?: string;
			} = {
				key: item.Key as string,
				size: item.Size ?? 0,
			};
			if (item.LastModified) {
				obj.lastModified = item.LastModified.toISOString();
			}
			if (item.ETag !== undefined) {
				obj.etag = item.ETag;
			}
			return obj;
		});

	const result: ObjectsListResponse = {
		folders,
		objects,
	};

	if (response.IsTruncated && response.NextContinuationToken) {
		result.nextToken = response.NextContinuationToken;
	}

	return result;
}
