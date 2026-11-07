import { afterAll, beforeAll, expect, it } from "vitest";
import {
	CreateBucketCommand,
	DeleteBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

const client = new S3Client({
	endpoint: "http://127.0.0.1:19000",
	region: "us-east-1",
	forcePathStyle: true,
	credentials: { accessKeyId: "rustfsadmin", secretAccessKey: "rustfsadmin" },
});
const bucket = `phase-one-${Date.now()}`;
const key = "range-object.txt";

beforeAll(async () => {
	await client.send(new CreateBucketCommand({ Bucket: bucket }));
	await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "0123456789" }));
});
afterAll(async () => {
	await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
	await client.send(new DeleteBucketCommand({ Bucket: bucket }));
	client.destroy();
});

it("returns requested bytes for a ranged object read", async () => {
	const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=3-6" }));
	expect(response.$metadata.httpStatusCode).toBe(206);
	expect(response.ContentRange).toBe("bytes 3-6/10");
	const chunks: Buffer[] = [];
	for await (const chunk of response.Body as Readable) chunks.push(Buffer.from(chunk));
	expect(Buffer.concat(chunks).toString()).toBe("3456");
});
