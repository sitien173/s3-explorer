import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
	createTestBucket,
	emptyAndDeleteBucket,
	seedObjects,
	setupHarness,
	createIntegrationSender,
	type IntegrationHarness,
} from "./helpers";
import { channels } from "../../src/shared/channels";

describe("RustFS listObjects and bucketsList integration", () => {
	const bucket = `integ-list-${Date.now()}`;
	let harness: IntegrationHarness;
	const seededKeys = new Set<string>();

	beforeAll(async () => {
		harness = await setupHarness();
		await createTestBucket(harness.s3Client, bucket);

		const items: { key: string; body?: string }[] = [];

		// 1. Large prefix with >1,000 keys to exercise pagination (1,200 keys)
		for (let i = 0; i < 1200; i++) {
			items.push({ key: `large/item-${i.toString().padStart(4, "0")}.txt` });
		}

		// 2. Medium prefix (800 keys)
		for (let i = 0; i < 800; i++) {
			items.push({ key: `medium/file-${i.toString().padStart(4, "0")}.txt` });
		}

		// 3. Nested prefixes (245 + 250 = 495 keys)
		for (let i = 0; i < 245; i++) {
			items.push({ key: `nested/sub1/doc-${i.toString().padStart(3, "0")}.txt` });
		}
		for (let i = 0; i < 250; i++) {
			items.push({ key: `nested/sub2/rec-${i.toString().padStart(3, "0")}.txt` });
		}

		// 4. Special characters (5 keys): spaces, unicode, +, %, &
		items.push(
			{ key: "special/spaced name.txt" },
			{ key: "special/café.txt" },
			{ key: "special/plus+sign.txt" },
			{ key: "special/percent%sign.txt" },
			{ key: "special/amp&ersand.txt" },
		);

		// Record seeded keys (exactly 2,500)
		for (const item of items) {
			seededKeys.add(item.key);
		}

		// Seed the 2,500 keys with bounded concurrency
		await seedObjects(harness.s3Client, bucket, items, 32);

		// 5. Zero-byte folder marker for special/
		await harness.s3Client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: "special/",
				Body: Buffer.from(""),
			}),
		);
	}, 120_000);

	afterAll(async () => {
		if (harness) {
			await emptyAndDeleteBucket(harness.s3Client, bucket);
			await harness.cleanup();
		}
	}, 120_000);

	it("walks every folder through objectsList with pagination, returns every key exactly once, drops folder markers, and verifies bucket listing", async () => {
		const sender = createIntegrationSender();
		const listedKeys: string[] = [];
		const queue: string[] = [""];

		while (queue.length > 0) {
			const prefix = queue.shift()!;
			let token: string | undefined;

			while (true) {
				const res = await harness.handlers.get(channels.objectsList)!(
					{ sender },
					{
						connectionId: harness.connection.id,
						bucket,
						prefix,
						token,
					},
				);

				expect(res.ok).toBe(true);
				const data = res.data;

				for (const obj of data.objects) {
					listedKeys.push(obj.key);
				}

				for (const folder of data.folders) {
					queue.push(folder);
				}

				if (data.nextToken) {
					token = data.nextToken;
				} else {
					break;
				}
			}
		}

		// Proves every seeded key is returned exactly once
		expect(listedKeys).toHaveLength(2500);
		const listedSet = new Set(listedKeys);
		expect(listedSet.size).toBe(2500);

		for (const key of seededKeys) {
			expect(listedSet.has(key), `Expected key ${key} to be listed`).toBe(true);
		}

		// Proves folder marker "special/" is not listed as an object
		expect(listedSet.has("special/")).toBe(false);

		// Check special character keys come back with exact names
		expect(listedSet.has("special/spaced name.txt")).toBe(true);
		expect(listedSet.has("special/café.txt")).toBe(true);
		expect(listedSet.has("special/plus+sign.txt")).toBe(true);
		expect(listedSet.has("special/percent%sign.txt")).toBe(true);
		expect(listedSet.has("special/amp&ersand.txt")).toBe(true);

		// Verify bucketsList shows bucket as listed, and pinned/unlisted names correctly
		await harness.store.update(harness.connection.id, {
			pinnedBuckets: ["unlisted-pinned-bkt"],
			extraBuckets: ["unlisted-extra-bkt"],
		});

		const bucketsRes = await harness.handlers.get(channels.bucketsList)!(
			{ sender },
			{ connectionId: harness.connection.id },
		);
		expect(bucketsRes.ok).toBe(true);
		const buckets = bucketsRes.data.buckets;

		const ourBucket = buckets.find((b: any) => b.name === bucket);
		expect(ourBucket).toBeDefined();
		expect(ourBucket?.listed).toBe(true);

		const unlistedPinned = buckets.find((b: any) => b.name === "unlisted-pinned-bkt");
		expect(unlistedPinned).toBeDefined();
		expect(unlistedPinned?.pinned).toBe(true);
		expect(unlistedPinned?.listed).toBe(false);

		const unlistedExtra = buckets.find((b: any) => b.name === "unlisted-extra-bkt");
		expect(unlistedExtra).toBeDefined();
		expect(unlistedExtra?.pinned).toBe(false);
		expect(unlistedExtra?.listed).toBe(false);
	});
});
