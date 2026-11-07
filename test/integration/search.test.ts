import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	createTestBucket,
	emptyAndDeleteBucket,
	seedObjects,
	setupHarness,
	createIntegrationSender,
	type IntegrationHarness,
} from "./helpers";
import { channels, events } from "../../src/shared/channels";

describe("RustFS bucket-wide search integration", () => {
	const bucket = `integ-search-${Date.now()}`;
	let harness: IntegrationHarness;

	const targetKeys = [
		"search/target_regular.txt",
		"search/TARGET_UPPER.txt",
		"search/target with spaces.txt",
		"search/target+plus.txt",
		"search/target%percent.txt",
		"search/target&amp.txt",
		"search/unícode_target.txt",
		"search/sub/nested_target_one.dat",
		"search/sub/nested_target_two.dat",
		"search/sub/nested_target_three.dat",
	];

	beforeAll(async () => {
		harness = await setupHarness();
		await createTestBucket(harness.s3Client, bucket);

		const items: { key: string; body?: string }[] = [];

		// 1. Target keys (10 keys)
		for (const key of targetKeys) {
			items.push({ key });
		}

		// 2. Bulk match keys for cancel test spanning multiple S3 pages (1,400 keys)
		for (let i = 0; i < 1400; i++) {
			items.push({ key: `bulk/bulkmatch_${i.toString().padStart(4, "0")}.txt` });
		}

		// 3. Other background keys to reach 2,500 total keys (1,090 keys)
		for (let i = 0; i < 1090; i++) {
			items.push({ key: `other/item_${i.toString().padStart(4, "0")}.bin` });
		}

		expect(items).toHaveLength(2500);

		// Seed all 2,500 keys with bounded concurrency
		await seedObjects(harness.s3Client, bucket, items, 32);
	}, 120_000);

	afterAll(async () => {
		if (harness) {
			await emptyAndDeleteBucket(harness.s3Client, bucket);
			await harness.cleanup();
		}
	}, 120_000);

	it("proves the exact expected match set for a case-insensitive query including keys with special characters", async () => {
		const sender = createIntegrationSender();
		const jobId = `job-search-target-${Date.now()}`;

		const startRes = await harness.handlers.get(channels.searchStart)!(
			{ sender },
			{
				jobId,
				connectionId: harness.connection.id,
				bucket,
				prefix: "search/",
				query: "target",
			},
		);
		expect(startRes.ok).toBe(true);

		// Wait for searchDone event
		await new Promise<void>((resolve) => {
			const check = () => {
				const done = sender.sent.find((s) => s.channel === events.searchDone);
				if (done) resolve();
				else setTimeout(check, 50);
			};
			check();
		});

		const batches = sender.sent.filter((s) => s.channel === events.searchBatch);
		const foundKeys = batches.flatMap((b: any) => b.payload.matches.map((m: any) => m.key));

		expect(foundKeys.sort()).toEqual([...targetKeys].sort());

		const done = sender.sent.find((s) => s.channel === events.searchDone)?.payload as any;
		expect(done).toMatchObject({
			jobId,
			truncated: false,
			cancelled: false,
		});
	});

	it("proves that a query matching only the search prefix returns nothing", async () => {
		const sender = createIntegrationSender();
		const jobId = `job-prefix-only-${Date.now()}`;

		const startRes = await harness.handlers.get(channels.searchStart)!(
			{ sender },
			{
				jobId,
				connectionId: harness.connection.id,
				bucket,
				prefix: "search/",
				query: "search",
			},
		);
		expect(startRes.ok).toBe(true);

		await new Promise<void>((resolve) => {
			const check = () => {
				const done = sender.sent.find((s) => s.channel === events.searchDone);
				if (done) resolve();
				else setTimeout(check, 50);
			};
			check();
		});

		const batches = sender.sent.filter((s) => s.channel === events.searchBatch);
		const foundKeys = batches.flatMap((b: any) => b.payload.matches);
		expect(foundKeys).toHaveLength(0);

		const done = sender.sent.find((s) => s.channel === events.searchDone)?.payload as any;
		expect(done).toMatchObject({
			jobId,
			truncated: false,
			cancelled: false,
		});
	});

	it("proves that a cancel issued from the first batch event yields searchDone with cancelled: true, no search:batch after cancel, and fewer matches than the total", async () => {
		const sender = createIntegrationSender();
		const jobId = `job-cancel-test-${Date.now()}`;

		let batchesAfterCancel = 0;
		let cancelIssued = false;

		const originalSend = sender.send.bind(sender);
		sender.send = (channel: string, payload: unknown) => {
			originalSend(channel, payload);

			if (channel === events.searchBatch) {
				if (!cancelIssued) {
					cancelIssued = true;
					// Issue cancel immediately upon receiving the first batch
					void harness.handlers.get(channels.searchCancel)!({ sender }, { jobId });
				} else {
					batchesAfterCancel++;
				}
			}
		};

		const startRes = await harness.handlers.get(channels.searchStart)!(
			{ sender },
			{
				jobId,
				connectionId: harness.connection.id,
				bucket,
				prefix: "bulk/",
				query: "bulkmatch",
			},
		);
		expect(startRes.ok).toBe(true);

		await new Promise<void>((resolve) => {
			const check = () => {
				const done = sender.sent.find((s) => s.channel === events.searchDone);
				if (done) resolve();
				else setTimeout(check, 50);
			};
			check();
		});

		// 1. searchDone with cancelled: true
		const done = sender.sent.find((s) => s.channel === events.searchDone)?.payload as any;
		expect(done).toMatchObject({
			jobId,
			cancelled: true,
		});

		// 2. no search:batch event after cancel call
		expect(batchesAfterCancel).toBe(0);

		// 3. fewer matches than the total (total was 1,400)
		const batches = sender.sent.filter((s) => s.channel === events.searchBatch);
		const matchesCount = batches.reduce((acc: number, b: any) => acc + b.payload.matches.length, 0);
		expect(matchesCount).toBeGreaterThan(0);
		expect(matchesCount).toBeLessThan(1400);
	});
});
