import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CreateBucketCommand,
	DeleteBucketCommand,
	DeleteObjectsCommand,
	ListObjectsV2Command,
	type ListObjectsV2CommandOutput,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { ConnectionStore, type ConnectionView } from "../../src/main/connections/store";
import { SecretVault } from "../../src/main/connections/secrets";
import { S3ClientFactory } from "../../src/main/s3/client";
import type { DialogLike } from "../../src/main/ipc/ops";
import { register, type SenderLike } from "../../src/main/ipc/register";

export type IntegrationHandler = (
	event: { sender: SenderLike },
	input: unknown,
) => Promise<any>;

export interface IntegrationHarness {
	dir: string;
	vault: SecretVault;
	store: ConnectionStore;
	factory: S3ClientFactory;
	connection: ConnectionView;
	s3Client: S3Client;
	handlers: Map<string, IntegrationHandler>;
	cleanup: () => Promise<void>;
}

export function createFakeCipher() {
	return {
		isEncryptionAvailable: () => true,
		getSelectedStorageBackend: () => "secure",
		encryptString: (value: string) => Buffer.from(value),
		decryptString: (value: Buffer) => value.toString(),
	};
}

export function createIntegrationSender(): SenderLike & {
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

export async function setupHarness(
	overrides: {
		dialog?: DialogLike;
		clients?: Pick<S3ClientFactory, "get" | "invalidate">;
	} = {},
): Promise<IntegrationHarness> {
	const dir = await mkdtemp(join(tmpdir(), "s3-integ-harness-"));
	const cipher = createFakeCipher();
	const vault = new SecretVault(dir, cipher as any);
	const store = new ConnectionStore(dir, vault);
	const factory = new S3ClientFactory(store, vault);

	const connection = await store.create({
		kind: "manual",
		name: "rustfs-manual",
		region: "us-east-1",
		endpoint: "http://127.0.0.1:19000",
		forcePathStyle: true,
		accessKeyId: "rustfsadmin",
		secretAccessKey: "rustfsadmin",
	});

	const s3Client = new S3Client({
		endpoint: "http://127.0.0.1:19000",
		region: "us-east-1",
		forcePathStyle: true,
		credentials: {
			accessKeyId: "rustfsadmin",
			secretAccessKey: "rustfsadmin",
		},
	});

	const handlers = new Map<string, IntegrationHandler>();
	register(
		{
			handle: (channel, listener) =>
				handlers.set(channel, listener as IntegrationHandler),
		},
		{
			store,
			clients: overrides.clients ?? factory,
			...(overrides.dialog ? { dialog: overrides.dialog } : {}),
		},
	);

	return {
		dir,
		vault,
		store,
		factory,
		connection,
		s3Client,
		handlers,
		cleanup: async () => {
			s3Client.destroy();
			await rm(dir, { recursive: true, force: true });
		},
	};
}

export async function waitFor(
	predicate: () => boolean | Promise<boolean>,
	timeoutMs: number,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (true) {
		if (await predicate()) return;
		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			throw new Error(`waitFor timed out after ${timeoutMs} ms`);
		}
		await new Promise<void>((resolve) =>
			setTimeout(resolve, Math.min(50, remaining)),
		);
	}
}

export async function createTestBucket(
	client: S3Client,
	bucket: string,
): Promise<void> {
	await client.send(new CreateBucketCommand({ Bucket: bucket }));
}

export async function emptyAndDeleteBucket(
	client: S3Client,
	bucket: string,
): Promise<void> {
	let continuationToken: string | undefined = undefined;
	while (true) {
		const list: ListObjectsV2CommandOutput = (await client.send(
			new ListObjectsV2Command({
				Bucket: bucket,
				ContinuationToken: continuationToken,
			}),
		)) as ListObjectsV2CommandOutput;
		const objects = list.Contents ?? [];
		if (objects.length > 0) {
			await client.send(
				new DeleteObjectsCommand({
					Bucket: bucket,
					Delete: {
						Objects: objects.map((obj) => ({ Key: obj.Key })),
					},
				}),
			);
		}
		if (list.IsTruncated && list.NextContinuationToken) {
			continuationToken = list.NextContinuationToken;
		} else {
			break;
		}
	}
	await client.send(new DeleteBucketCommand({ Bucket: bucket }));
}

export async function seedObjects(
	client: S3Client,
	bucket: string,
	keys: { key: string; body?: string | Uint8Array }[],
	concurrency = 32,
): Promise<void> {
	let cursor = 0;
	async function worker() {
		while (true) {
			const idx = cursor++;
			if (idx >= keys.length) break;
			const item = keys[idx];
			const body =
				typeof item.body === "string"
					? Buffer.from(item.body)
					: item.body ?? Buffer.from("content");
			await client.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: item.key,
					Body: body,
				}),
			);
		}
	}
	const workers = Array.from({ length: concurrency }, () => worker());
	await Promise.all(workers);
}
