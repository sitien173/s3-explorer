import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HeadObjectCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import {
	createTestBucket,
	emptyAndDeleteBucket,
	seedObjects,
	setupHarness,
	createIntegrationSender,
	type IntegrationHarness,
} from "./helpers";
import { channels } from "../../src/shared/channels";

describe("RustFS bucket create and delete integration", () => {
	const suffix = Date.now();
	const lifecycleBucket = `integ-crud-life-${suffix}`;
	const duplicateBucket = `integ-crud-dup-${suffix}`;
	const nonEmptyBucket = `integ-crud-full-${suffix}`;
	let harness: IntegrationHarness;

	const call = (channel: string, bucket: string) =>
		harness.handlers.get(channel)!(
			{ sender: createIntegrationSender() },
			{ connectionId: harness.connection.id, bucket },
		);
	const listNames = async () => {
		const res = await harness.handlers.get(channels.bucketsList)!(
			{ sender: createIntegrationSender() },
			{ connectionId: harness.connection.id },
		);
		return (res.data.buckets as { name: string }[]).map((b) => b.name);
	};

	beforeAll(async () => {
		harness = await setupHarness();
	});

	afterAll(async () => {
		for (const bucket of [lifecycleBucket, duplicateBucket, nonEmptyBucket]) {
			try {
				await emptyAndDeleteBucket(harness.s3Client, bucket);
			} catch {
				// bucket already gone
			}
		}
		await harness.cleanup();
	});

	it("creates, lists, and deletes a bucket", async () => {
		const created = await call(channels.bucketsCreate, lifecycleBucket);
		expect(created).toEqual({ ok: true, data: { bucket: lifecycleBucket } });

		const real = await harness.s3Client.send(new ListBucketsCommand({}));
		expect(real.Buckets?.map((b) => b.Name)).toContain(lifecycleBucket);
		expect(await listNames()).toContain(lifecycleBucket);

		const deleted = await call(channels.bucketsDelete, lifecycleBucket);
		expect(deleted).toEqual({ ok: true, data: { bucket: lifecycleBucket } });
		expect(await listNames()).not.toContain(lifecycleBucket);
		const after = await harness.s3Client.send(new ListBucketsCommand({}));
		expect(after.Buckets?.map((b) => b.Name)).not.toContain(lifecycleBucket);
	});

	it("loses no data when an owned bucket is created again", async () => {
		const first = await call(channels.bucketsCreate, duplicateBucket);
		expect(first.ok).toBe(true);
		await seedObjects(harness.s3Client, duplicateBucket, [{ key: "keep.txt", body: "keep" }]);
		const second = await call(channels.bucketsCreate, duplicateBucket);
		// RustFS returns 200 for an owned-bucket recreate in us-east-1, as AWS may.
		expect([
			{ ok: true, data: { bucket: duplicateBucket } },
			{
				ok: false,
				error: { code: "BUCKET_EXISTS", message: "Bucket name is taken" },
			},
		]).toContainEqual(second);
		const head = await harness.s3Client.send(new HeadObjectCommand({ Bucket: duplicateBucket, Key: "keep.txt" }));
		expect(head.ContentLength).toBe(4);
	});

	it("returns BUCKET_NOT_EMPTY and keeps the object when deleting a non-empty bucket", async () => {
		await createTestBucket(harness.s3Client, nonEmptyBucket);
		await seedObjects(harness.s3Client, nonEmptyBucket, [{ key: "keep.txt", body: "keep" }]);
		const result = await call(channels.bucketsDelete, nonEmptyBucket);
		expect(result).toEqual({
			ok: false,
			error: { code: "BUCKET_NOT_EMPTY", message: "Bucket is not empty" },
		});
		const head = await harness.s3Client.send(new HeadObjectCommand({ Bucket: nonEmptyBucket, Key: "keep.txt" }));
		expect(head.ContentLength).toBe(4);
	});
});
