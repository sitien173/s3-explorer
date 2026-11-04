import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ConnectionStore } from "../../src/main/connections/store";
import { SecretVault } from "../../src/main/connections/secrets";
import { register, type SenderLike } from "../../src/main/ipc/register";
import { browseHandlers, SearchJobRegistry, mapS3Error } from "../../src/main/ipc/browse";
import { searchDonePayloadSchema } from "../../src/shared/ipc";
import { channels } from "../../src/shared/channels";
import { assertNoSecrets } from "./secret-scan";

function createFakeCipher() {
	return {
		isEncryptionAvailable: () => true,
		getSelectedStorageBackend: () => "secure",
		encryptString: (value: string) => Buffer.from(value),
		decryptString: (value: Buffer) => value.toString(),
	};
}

function createFakeSender(): SenderLike & {
	sent: { channel: string; payload: unknown }[];
	destroyed: boolean;
	listeners: Map<string, (() => void)[]>;
} {
	const listeners = new Map<string, (() => void)[]>();
	return {
		sent: [],
		destroyed: false,
		listeners,
		send(channel: string, payload: unknown) {
			this.sent.push({ channel, payload });
		},
		isDestroyed() {
			return this.destroyed;
		},
		once(event: "destroyed", listener: () => void) {
			const list = listeners.get(event) ?? [];
			list.push(listener);
			listeners.set(event, list);
		},
		removeListener(event: "destroyed", listener: () => void) {
			const list = listeners.get(event) ?? [];
			const index = list.indexOf(listener);
			if (index !== -1) list.splice(index, 1);
		},
	};
}

describe("browse error mapping contract", () => {
 it.each(["NoSuchBucket","NoSuchKey","NotFound"])("maps %s to fixed NOT_FOUND", name => expect(mapS3Error(Object.assign(new Error("private text"),{name}))).toEqual({code:"NOT_FOUND",message:"Request failed"}));
});

describe("browse IPC - buckets and listing", () => {
	it("merges listed, pinned, and extra buckets with correct sort and flags, and handles AccessDenied", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-buckets-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();
		let s3SendImpl: (command: any) => Promise<any> = async () => ({
			Buckets: [{ Name: "alpha" }, { Name: "charlie" }],
		});

		const clients: any = {
			get: async () => ({
				send: (cmd: any) => s3SendImpl(cmd),
			}),
			invalidate: vi.fn(),
		};

		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients },
		);

		const conn = await store.create({
			kind: "manual",
			name: "test-conn",
			region: "us-east-1",
			accessKeyId: "KEYID123",
			secretAccessKey: "SECRET123",
		});
		await store.update(conn.id, {
			pinnedBuckets: ["zebra", "charlie"],
			extraBuckets: ["beta", "alpha"],
		});

		const sender = createFakeSender();
		const result = await handlers.get(channels.bucketsList)!(
			{ sender },
			{ connectionId: conn.id },
		);

		expect(result.ok).toBe(true);
		expect(result.data.listDenied).toBe(false);
		expect(result.data.buckets).toEqual([
			{ name: "charlie", pinned: true, listed: true },
			{ name: "zebra", pinned: true, listed: false },
			{ name: "alpha", pinned: false, listed: true },
			{ name: "beta", pinned: false, listed: false },
		]);

		// When ListBuckets fails with AccessDenied
		s3SendImpl = async () => {
			throw Object.assign(new Error("User is not authorized"), {
				name: "AccessDenied",
			});
		};

		const deniedResult = await handlers.get(channels.bucketsList)!(
			{ sender },
			{ connectionId: conn.id },
		);
		expect(deniedResult.ok).toBe(true);
		expect(deniedResult.data.listDenied).toBe(true);
		expect(deniedResult.data.buckets).toEqual([
			{ name: "charlie", pinned: true, listed: false },
			{ name: "zebra", pinned: true, listed: false },
			{ name: "alpha", pinned: false, listed: false },
			{ name: "beta", pinned: false, listed: false },
		]);
	});

	it("persists and deduplicates pin, unpin, and add, and returns NOT_FOUND for unknown connection", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-pin-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();
		const clients: any = {
			get: vi.fn(),
			invalidate: vi.fn(),
		};

		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients },
		);

		const conn = await store.create({
			kind: "manual",
			name: "pin-test",
			region: "us-east-1",
			accessKeyId: "KEYID123",
			secretAccessKey: "SECRET123",
		});

		const sender = createFakeSender();

		// Pin a bucket
		const pinRes = await handlers.get(channels.bucketsPin)!(
			{ sender },
			{ connectionId: conn.id, bucket: "bucket-a" },
		);
		expect(pinRes.ok).toBe(true);
		expect(pinRes.data.pinnedBuckets).toEqual(["bucket-a"]);

		// Pin duplicate bucket - deduplicated
		const pinDup = await handlers.get(channels.bucketsPin)!(
			{ sender },
			{ connectionId: conn.id, bucket: "bucket-a" },
		);
		expect(pinDup.ok).toBe(true);
		expect(pinDup.data.pinnedBuckets).toEqual(["bucket-a"]);

		// Add extra bucket
		const addRes = await handlers.get(channels.bucketsAdd)!(
			{ sender },
			{ connectionId: conn.id, bucket: "extra-1" },
		);
		expect(addRes.ok).toBe(true);
		expect(addRes.data.extraBuckets).toEqual(["extra-1"]);

		// Add duplicate extra bucket
		const addDup = await handlers.get(channels.bucketsAdd)!(
			{ sender },
			{ connectionId: conn.id, bucket: "extra-1" },
		);
		expect(addDup.ok).toBe(true);
		expect(addDup.data.extraBuckets).toEqual(["extra-1"]);

		// Unpin bucket
		const unpinRes = await handlers.get(channels.bucketsUnpin)!(
			{ sender },
			{ connectionId: conn.id, bucket: "bucket-a" },
		);
		expect(unpinRes.ok).toBe(true);
		expect(unpinRes.data.pinnedBuckets).toEqual([]);

		// Unpin absent bucket - no-op
		const unpinAbsent = await handlers.get(channels.bucketsUnpin)!(
			{ sender },
			{ connectionId: conn.id, bucket: "absent" },
		);
		expect(unpinAbsent.ok).toBe(true);
		expect(unpinAbsent.data.pinnedBuckets).toEqual([]);

		// Verify clients.get and clients.invalidate were never called
		expect(clients.get).not.toHaveBeenCalled();
		expect(clients.invalidate).not.toHaveBeenCalled();

		// Unknown connection returns NOT_FOUND
		const unknown = await handlers.get(channels.bucketsPin)!(
			{ sender },
			{ connectionId: "nonexistent", bucket: "b" },
		);
		expect(unknown.ok).toBe(false);
		expect(unknown.error.code).toBe("NOT_FOUND");
	});

	it("maps objectsList: folders, objects, dropped folder marker, nextToken, missing Size, and ISO lastModified", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-list-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();
		const modDate = new Date("2026-05-01T12:00:00.000Z");

		let listOutput: any = {
			CommonPrefixes: [{ Prefix: "photos/summer/" }, { Prefix: "photos/winter/" }],
			Contents: [
				{ Key: "photos/", Size: 0 }, // folder marker - must be dropped
				{
					Key: "photos/img1.png",
					Size: 1024,
					LastModified: modDate,
					ETag: '"etag1"',
				},
				{ Key: "photos/img2.png" }, // missing Size
			],
			IsTruncated: true,
			NextContinuationToken: "token-123",
		};

		const clients: any = {
			get: async () => ({
				send: async () => listOutput,
			}),
		};

		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients },
		);

		const conn = await store.create({
			kind: "manual",
			name: "list-test",
			region: "us-east-1",
			accessKeyId: "KEYID123",
			secretAccessKey: "SECRET123",
		});

		const sender = createFakeSender();
		const result = await handlers.get(channels.objectsList)!(
			{ sender },
			{ connectionId: conn.id, bucket: "my-bucket", prefix: "photos/" },
		);

		expect(result.ok).toBe(true);
		expect(result.data.folders).toEqual([
			"photos/summer/",
			"photos/winter/",
		]);
		expect(result.data.objects).toEqual([
			{
				key: "photos/img1.png",
				size: 1024,
				lastModified: "2026-05-01T12:00:00.000Z",
				etag: '"etag1"',
			},
			{
				key: "photos/img2.png",
				size: 0,
			},
		]);
		expect(result.data.nextToken).toBe("token-123");

		// Non-truncated result omits nextToken
		listOutput = {
			CommonPrefixes: [],
			Contents: [{ Key: "file.txt", Size: 42 }],
			IsTruncated: false,
			NextContinuationToken: "ignored-token",
		};
		const nonTruncated = await handlers.get(channels.objectsList)!(
			{ sender },
			{ connectionId: conn.id, bucket: "my-bucket" },
		);
		expect(nonTruncated.ok).toBe(true);
		expect(nonTruncated.data.nextToken).toBeUndefined();
	});

	it("maps S3 errors to ACCESS_DENIED, NOT_FOUND, SSO_LOGIN_REQUIRED, and redacts AKIA from REQUEST_FAILED", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-errors-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();
		let errorToThrow: any = null;

		const clients: any = {
			get: async () => ({
				send: async () => {
					throw errorToThrow;
				},
			}),
		};

		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients },
		);

		const manualConn = await store.create({
			kind: "manual",
			name: "manual-err",
			region: "us-east-1",
			accessKeyId: "KEYID123",
			secretAccessKey: "SECRET123",
		});
		const profileConn = await store.create({
			kind: "profile",
			name: "profile-err",
			profile: "my-sso-profile",
		});

		const sender = createFakeSender();

		// AccessDenied -> ACCESS_DENIED
		errorToThrow = Object.assign(new Error("Forbidden"), { name: "AccessDenied" });
		const accessDenied = await handlers.get(channels.objectsList)!(
			{ sender },
			{ connectionId: manualConn.id, bucket: "my-bucket" },
		);
		expect(accessDenied.ok).toBe(false);
		expect(accessDenied.error.code).toBe("ACCESS_DENIED");
		expect(accessDenied.error.message).toBe("Access denied");

		// NoSuchBucket -> NOT_FOUND
		errorToThrow = Object.assign(new Error("Bucket not found"), {
			name: "NoSuchBucket",
		});
		const noBucket = await handlers.get(channels.objectsList)!(
			{ sender },
			{ connectionId: manualConn.id, bucket: "my-bucket" },
		);
		expect(noBucket.ok).toBe(false);
		expect(noBucket.error.code).toBe("NOT_FOUND");

		// SSO error on profile connection -> SSO_LOGIN_REQUIRED
		errorToThrow = Object.assign(new Error("The SSO session token is expired"), {
			name: "TokenProviderError",
		});
		const ssoErr = await handlers.get(channels.objectsList)!(
			{ sender },
			{ connectionId: profileConn.id, bucket: "my-bucket" },
		);
		expect(ssoErr.ok).toBe(false);
		expect(ssoErr.error.code).toBe("SSO_LOGIN_REQUIRED");
		expect(ssoErr.error.profile).toBe("my-sso-profile");

		// Redaction of AKIA in REQUEST_FAILED
		errorToThrow = Object.assign(
			new Error("Request failed for AKIAFIXTUREFIXTURE00 with error"),
			{ name: "UnknownError" },
		);
		const redacted = await handlers.get(channels.objectsList)!(
			{ sender },
			{ connectionId: manualConn.id, bucket: "my-bucket" },
		);
		expect(redacted.ok).toBe(false);
		expect(redacted.error.code).toBe("REQUEST_FAILED");
		expect(redacted.error.message).toContain("[redacted]");
		expect(redacted.error.message).not.toContain("AKIAFIXTUREFIXTURE00");
	});

	it("returns INVALID_REQUEST for bad bucket name, over-long prefix, and missing connectionId without calling client", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-validation-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();
		const clients: any = {
			get: vi.fn(),
		};

		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients },
		);

		const sender = createFakeSender();

		// Bad bucket name (starts with dash or invalid chars)
		const badBucket = await handlers.get(channels.objectsList)!(
			{ sender },
			{ connectionId: "conn-1", bucket: "-invalid-start" },
		);
		expect(badBucket.ok).toBe(false);
		expect(badBucket.error.code).toBe("INVALID_REQUEST");

		// Over-long prefix (> 1024 chars)
		const longPrefix = "a".repeat(1025);
		const badPrefix = await handlers.get(channels.objectsList)!(
			{ sender },
			{ connectionId: "conn-1", bucket: "valid-bucket", prefix: longPrefix },
		);
		expect(badPrefix.ok).toBe(false);
		expect(badPrefix.error.code).toBe("INVALID_REQUEST");

		// Missing connectionId
		const missingConn = await handlers.get(channels.objectsList)!(
			{ sender },
			{ bucket: "valid-bucket" },
		);
		expect(missingConn.ok).toBe(false);
		expect(missingConn.error.code).toBe("INVALID_REQUEST");

		expect(clients.get).not.toHaveBeenCalled();
	});
});

describe("browse IPC - search job registry", () => {
	it("starts search and delivers validated batch, progress, and done events", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-search-events-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();

		const clients: any = {
			get: async () => ({
				send: async () => ({
					Contents: [
						{ Key: "logs/app.log", Size: 100, LastModified: new Date("2026-01-01T00:00:00Z") },
						{ Key: "logs/other.txt", Size: 50 },
					],
					IsTruncated: false,
				}),
			}),
		};

		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients },
		);

		const conn = await store.create({
			kind: "manual",
			name: "search-conn",
			region: "us-east-1",
			accessKeyId: "KEYID123",
			secretAccessKey: "SECRET123",
		});

		const sender = createFakeSender();
		const startRes = await handlers.get(channels.searchStart)!(
			{ sender },
			{
				jobId: "job-12345678",
				connectionId: conn.id,
				bucket: "my-bucket",
				prefix: "logs/",
				query: "app",
			},
		);

		expect(startRes.ok).toBe(true);
		expect(startRes.data.jobId).toBe("job-12345678");

		// Wait for runSearch promise to settle
		await vi.waitFor(() => {
			expect(sender.sent.map((s) => s.channel)).toEqual([
				"search:batch",
				"search:progress",
				"search:done",
			]);
		});

		const batch = sender.sent[0].payload as any;
		expect(batch.jobId).toBe("job-12345678");
		expect(batch.matches).toHaveLength(1);
		expect(batch.matches[0].key).toBe("logs/app.log");

		const progress = sender.sent[1].payload as any;
		expect(progress).toEqual({
			jobId: "job-12345678",
			scanned: 2,
			matched: 1,
		});

		const done = sender.sent[2].payload as any;
		expect(done).toEqual({
			jobId: "job-12345678",
			truncated: false,
			cancelled: false,
		});
	});

	it("handles searchCancel by owner vs foreign sender and duplicate jobId", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-search-cancel-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();

		let s3Resolve: ((val: any) => void) | null = null;
		const clients: any = {
			get: async () => ({
				send: async (_cmd: any, opts: any) => {
					return new Promise((resolve, reject) => {
						s3Resolve = resolve;
						if (opts?.abortSignal) {
							opts.abortSignal.addEventListener("abort", () => {
								const err = new Error("Aborted");
								err.name = "AbortError";
								reject(err);
							});
						}
					});
				},
			}),
		};

		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients },
		);

		const conn = await store.create({
			kind: "manual",
			name: "search-conn",
			region: "us-east-1",
			accessKeyId: "KEYID123",
			secretAccessKey: "SECRET123",
		});

		const ownerSender = createFakeSender();
		const foreignSender = createFakeSender();

		const startRes = await handlers.get(channels.searchStart)!(
			{ sender: ownerSender },
			{
				jobId: "job-cancel-test-1",
				connectionId: conn.id,
				bucket: "my-bucket",
				prefix: "",
				query: "test",
			},
		);
		expect(startRes.ok).toBe(true);

		// Duplicate jobId returns INVALID_REQUEST
		const dupRes = await handlers.get(channels.searchStart)!(
			{ sender: ownerSender },
			{
				jobId: "job-cancel-test-1",
				connectionId: conn.id,
				bucket: "my-bucket",
				prefix: "",
				query: "test",
			},
		);
		expect(dupRes.ok).toBe(false);
		expect(dupRes.error.code).toBe("INVALID_REQUEST");
		expect(dupRes.error.message).toBe("Job already exists");

		// Foreign sender cancel returns { cancelled: false }
		const foreignCancel = await handlers.get(channels.searchCancel)!(
			{ sender: foreignSender },
			{ jobId: "job-cancel-test-1" },
		);
		expect(foreignCancel.ok).toBe(true);
		expect(foreignCancel.data.cancelled).toBe(false);

		// Owner cancel returns { cancelled: true }
		const ownerCancel = await handlers.get(channels.searchCancel)!(
			{ sender: ownerSender },
			{ jobId: "job-cancel-test-1" },
		);
		expect(ownerCancel.ok).toBe(true);
		expect(ownerCancel.data.cancelled).toBe(true);

		// Wait for job to settle and send searchDone
		await vi.waitFor(() => {
			expect(
				ownerSender.sent.some((s) => s.channel === "search:done"),
			).toBe(true);
		});

		const done = ownerSender.sent.find((s) => s.channel === "search:done");
		expect(done).toBeDefined();
		expect(done?.payload).toEqual({
			jobId: "job-cancel-test-1",
			truncated: false,
			cancelled: true,
		});
	});

	it("reports mid-search error in searchDone.error and cleans up", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-search-error-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();

		const clients: any = {
			get: async () => ({
				send: async () => {
					throw Object.assign(new Error("Access Denied to bucket"), {
						name: "AccessDenied",
					});
				},
			}),
		};

		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients },
		);

		const conn = await store.create({
			kind: "manual",
			name: "search-conn",
			region: "us-east-1",
			accessKeyId: "KEYID123",
			secretAccessKey: "SECRET123",
		});

		const sender = createFakeSender();
		const startRes = await handlers.get(channels.searchStart)!(
			{ sender },
			{
				jobId: "job-err-test-1",
				connectionId: conn.id,
				bucket: "my-bucket",
				prefix: "",
				query: "test",
			},
		);
		expect(startRes.ok).toBe(true);

		await vi.waitFor(() => {
			expect(
				sender.sent.some((s) => s.channel === "search:done"),
			).toBe(true);
		});

		const done = sender.sent.find((s) => s.channel === "search:done");
		expect(done).toBeDefined();
		expect(done?.payload).toEqual({
			jobId: "job-err-test-1",
			truncated: false,
			cancelled: false,
			error: {
				code: "ACCESS_DENIED",
				message: "Access denied",
			},
		});
	});

	it("cleans up listeners and registry across 25 sequential searches, and sends nothing after destroy", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-search-cleanup-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();

		const clients: any = {
			get: async () => ({
				send: async () => ({
					Contents: [],
					IsTruncated: false,
				}),
			}),
		};

		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients },
		);

		const conn = await store.create({
			kind: "manual",
			name: "search-conn",
			region: "us-east-1",
			accessKeyId: "KEYID123",
			secretAccessKey: "SECRET123",
		});

		const sender = createFakeSender();

		// Run 25 sequential searches
		for (let i = 0; i < 25; i++) {
			const jobId = `job-sequential-${i.toString().padStart(8, "0")}`;
			await handlers.get(channels.searchStart)!(
				{ sender },
				{
					jobId,
					connectionId: conn.id,
					bucket: "my-bucket",
					prefix: "",
					query: "q",
				},
			);
			await new Promise((r) => setTimeout(r, 10));
		}

		// The destroyed listener count must return to 0
		const destroyedListeners = sender.listeners.get("destroyed") ?? [];
		expect(destroyedListeners.length).toBe(0);

		// Now test sender destroy aborts and sends nothing
		let sendStarted = false;
		clients.get = async () => ({
			send: async (_cmd: any, opts: any) => {
				sendStarted = true;
				return new Promise((_resolve, reject) => {
					opts?.abortSignal?.addEventListener("abort", () => {
						const err = new Error("Aborted");
						err.name = "AbortError";
						reject(err);
					});
				});
			},
		});

		const destroyRegistry = new SearchJobRegistry();
		const destroyHandlers = browseHandlers({
			store,
			clients,
			jobRegistry: destroyRegistry,
		});
		const destroySender = createFakeSender();
		await destroyHandlers[channels.searchStart](
			{
				jobId: "job-destroy-test",
				connectionId: conn.id,
				bucket: "my-bucket",
				prefix: "",
				query: "q",
			},
			{ sender: destroySender },
		);

		await vi.waitFor(() => {
			expect(sendStarted).toBe(true);
		});
		expect(destroyRegistry.size).toBe(1);
		expect(destroySender.listeners.get("destroyed")?.length).toBe(1);

		// Trigger destroy
		destroySender.destroyed = true;
		const listeners = [...(destroySender.listeners.get("destroyed") ?? [])];
		for (const l of listeners) l();

		await vi.waitFor(() => {
			expect(destroyRegistry.size).toBe(0);
		});
		expect(destroySender.listeners.get("destroyed")?.length).toBe(0);
		expect(destroySender.sent).toHaveLength(0);
	});

	it("ensures no secrets leak across any browse response or event payload", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-secrets-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();

		const clients: any = {
			get: async () => ({
				send: async () => ({
					Buckets: [{ Name: "clean-bucket" }],
					CommonPrefixes: [{ Prefix: "folder/" }],
					Contents: [{ Key: "folder/file.txt", Size: 123 }],
					IsTruncated: false,
				}),
			}),
		};

		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients },
		);

		const conn = await store.create({
			kind: "manual",
			name: "secret-check",
			region: "us-east-1",
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture-super-secret",
		});

		const sender = createFakeSender();

		const listRes = await handlers.get(channels.bucketsList)!(
			{ sender },
			{ connectionId: conn.id },
		);
		expect(listRes.ok).toBe(true);
		assertNoSecrets(listRes);

		const pinRes = await handlers.get(channels.bucketsPin)!(
			{ sender },
			{ connectionId: conn.id, bucket: "clean-bucket" },
		);
		expect(pinRes.ok).toBe(true);
		assertNoSecrets(pinRes);

		const addRes = await handlers.get(channels.bucketsAdd)!(
			{ sender },
			{ connectionId: conn.id, bucket: "extra-clean" },
		);
		expect(addRes.ok).toBe(true);
		assertNoSecrets(addRes);

		const unpinRes = await handlers.get(channels.bucketsUnpin)!(
			{ sender },
			{ connectionId: conn.id, bucket: "clean-bucket" },
		);
		expect(unpinRes.ok).toBe(true);
		assertNoSecrets(unpinRes);

		const objRes = await handlers.get(channels.objectsList)!(
			{ sender },
			{ connectionId: conn.id, bucket: "clean-bucket", prefix: "folder/" },
		);
		expect(objRes.ok).toBe(true);
		assertNoSecrets(objRes);

		const searchRes = await handlers.get(channels.searchStart)!(
			{ sender },
			{
				jobId: "job-secret-scan-1",
				connectionId: conn.id,
				bucket: "clean-bucket",
				prefix: "folder/",
				query: "file",
			},
		);
		expect(searchRes.ok).toBe(true);
		assertNoSecrets(searchRes);

		await vi.waitFor(() => {
			expect(
				sender.sent.some((s) => s.channel === "search:done"),
			).toBe(true);
		});

		for (const event of sender.sent) {
			assertNoSecrets(event.payload);
		}

		const cancelRes = await handlers.get(channels.searchCancel)!(
			{ sender },
			{ jobId: "job-secret-scan-1" },
		);
		expect(cancelRes.ok).toBe(true);
		assertNoSecrets(cancelRes);
	});

	it("redacts access key ids from searchDone.error when search rejects", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-fix1-redact-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();

		const clients: any = {
			get: async () => ({
				send: async () => {
					throw new Error("denied for AKIAFIXTUREFIXTURE00 here");
				},
			}),
		};

		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients },
		);

		const conn = await store.create({
			kind: "manual",
			name: "clean-conn",
			region: "us-east-1",
			accessKeyId: "KEYID123",
			secretAccessKey: "KEYVAL123",
		});

		const sender = createFakeSender();
		const startRes = await handlers.get(channels.searchStart)!(
			{ sender },
			{
				jobId: "job-redact-test-1",
				connectionId: conn.id,
				bucket: "clean-bucket",
				prefix: "",
				query: "test",
			},
		);
		expect(startRes.ok).toBe(true);

		await vi.waitFor(() => {
			expect(
				sender.sent.some((s) => s.channel === "search:done"),
			).toBe(true);
		});

		const done = sender.sent.find((s) => s.channel === "search:done");
		expect(done).toBeDefined();
		const payload = searchDonePayloadSchema.parse(done?.payload);
		expect(payload.error?.message).not.toContain("AKIAFIXTUREFIXTURE00");
		expect(payload.error?.message).toContain("[redacted]");
		assertNoSecrets(payload);
	});

	it("prevents search execution and cleans up when sender is destroyed during clients.get", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-fix1-destroy-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);

		const sendFn = vi.fn();
		const sender = createFakeSender();

		const clients: any = {
			get: async () => {
				sender.destroyed = true;
				return {
					send: sendFn,
				};
			},
		};

		const browse = browseHandlers({ store, clients });

		const conn = await store.create({
			kind: "manual",
			name: "clean-conn",
			region: "us-east-1",
			accessKeyId: "KEYID123",
			secretAccessKey: "KEYVAL123",
		});

		const res = await browse[channels.searchStart](
			{
				jobId: "job-destroy-get-1",
				connectionId: conn.id,
				bucket: "clean-bucket",
				prefix: "",
				query: "test",
			},
			{ sender },
		);
		expect(res).toEqual({ jobId: "job-destroy-get-1" });

		await vi.waitFor(() => {
			expect(browse.getRegistrySize()).toBe(0);
			expect(sender.listeners.get("destroyed")?.length ?? 0).toBe(0);
		});

		expect(sendFn).not.toHaveBeenCalled();
		expect(browse.getRegistrySize()).toBe(0);
		expect(sender.listeners.get("destroyed")?.length ?? 0).toBe(0);
	});

	it("rejects concurrent searchStart with the same jobId when clients.get is delayed", async () => {
		const dir = await mkdtemp(join(tmpdir(), "browse-fix1-concurrent-"));
		const vault = new SecretVault(dir, createFakeCipher() as any);
		const store = new ConnectionStore(dir, vault);
		const handlers = new Map<string, (event: any, input: any) => Promise<any>>();

		let runs = 0;
		const clients: any = {
			get: async () => {
				await new Promise((r) => setTimeout(r, 20));
				return {
					send: async () => {
						runs++;
						await new Promise((r) => setTimeout(r, 30));
						return { Contents: [], IsTruncated: false };
					},
				};
			},
		};

		const jobRegistry = new SearchJobRegistry();
		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients, jobRegistry } as any,
		);

		const conn = await store.create({
			kind: "manual",
			name: "clean-conn",
			region: "us-east-1",
			accessKeyId: "KEYID123",
			secretAccessKey: "KEYVAL123",
		});

		const sender = createFakeSender();

		const p1 = handlers.get(channels.searchStart)!(
			{ sender },
			{
				jobId: "job-concurrent-1",
				connectionId: conn.id,
				bucket: "clean-bucket",
				prefix: "",
				query: "test",
			},
		);
		const p2 = handlers.get(channels.searchStart)!(
			{ sender },
			{
				jobId: "job-concurrent-1",
				connectionId: conn.id,
				bucket: "clean-bucket",
				prefix: "",
				query: "test",
			},
		);

		const [res1, res2] = await Promise.all([p1, p2]);

		const okCount = (res1.ok ? 1 : 0) + (res2.ok ? 1 : 0);
		const errCount =
			(!res1.ok && res1.error?.code === "INVALID_REQUEST" ? 1 : 0) +
			(!res2.ok && res2.error?.code === "INVALID_REQUEST" ? 1 : 0);

		expect(okCount).toBe(1);
		expect(errCount).toBe(1);

		await new Promise((r) => setTimeout(r, 60));

		expect(runs).toBe(1);
		expect(jobRegistry.size).toBe(0);
		expect(sender.listeners.get("destroyed")?.length ?? 0).toBe(0);
	});
});
