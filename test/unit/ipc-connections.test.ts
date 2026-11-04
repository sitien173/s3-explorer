import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConnectionStore } from "../../src/main/connections/store";
import { SecretVault } from "../../src/main/connections/secrets";
import { register } from "../../src/main/ipc/register";
import { S3ClientFactory } from "../../src/main/s3/client";
import { assertNoSecrets } from "./secret-scan";
import { expectTypeOf } from "vitest";
import type { Api, CreateRequest } from "../../src/shared/ipc";

const channels = [
	"connections:list",
	"connections:create",
	"connections:update",
	"connections:delete",
	"connections:testConnection",
	"connections:ssoLogin",
	"connections:listProfiles",
];

describe("connection IPC", () => {
	it("exposes an inferred create request type that requires its discriminator", () => {
		expectTypeOf<Api["connections"]["create"]>()
			.parameter(0)
			.toEqualTypeOf<CreateRequest>();
		if (false) {
			// @ts-expect-error Create requests must include their kind discriminator.
			void (null as unknown as Api).connections.create({
				name: "missing-kind",
			});
		}
	});
	it("validates each channel request and returns successful responses without secrets", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ipc-connections-"));
		const cipher: any = {
			isEncryptionAvailable: () => true,
			getSelectedStorageBackend: () => "secure",
			encryptString: (value: string) => Buffer.from(value),
			decryptString: (value: Buffer) => value.toString(),
		};
		const vault = new SecretVault(directory, cipher);
		const store = new ConnectionStore(directory, vault);
		const handlers = new Map<string, any>();
		let sendMode: "success" | "failure" | "sso" = "success";
		const invalidated: string[] = [];
		const clients: any = {
			get: async () => ({
				send: async () => {
					if (sendMode === "failure")
						throw new Error("failed for AKIAFIXTUREFIXTURE00");
					if (sendMode === "sso")
						throw Object.assign(new Error("Token is expired."), {
							name: "TokenProviderError",
						});
					return { Buckets: [] };
				},
			}),
			invalidate: (id: string) => invalidated.push(id),
		};
		const deps: any = {
			store,
			clients,
			configFilepath: "test/fixtures/aws/config",
			credentialsFilepath: "test/fixtures/aws/credentials",
			login: async () => ({ ok: true }),
		};
		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			deps,
		);

		const manual = await store.create({
			kind: "manual",
			name: "manual",
			region: "us-east-1",
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture-secret",
		});
		const profile = await store.create({
			kind: "profile",
			name: "sso",
			profile: "sso-dev",
		});
		const another = await store.create({
			kind: "manual",
			name: "delete-me",
			region: "us-east-1",
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture-secret",
		});
		const requests: Record<string, unknown> = {
			"connections:list": {},
			"connections:create": {
				kind: "profile",
				name: "created",
				profile: "default",
			},
			"connections:update": { id: manual.id, name: "updated" },
			"connections:delete": { id: another.id },
			"connections:testConnection": { id: manual.id },
			"connections:ssoLogin": { profile: "sso-dev" },
			"connections:listProfiles": {},
		};

		for (const channel of channels) {
			const result = await handlers.get(channel)({}, requests[channel]);
			expect(result.ok, channel).toBe(true);
			assertNoSecrets(result);
		}
		expect(invalidated).toContain(manual.id);
		expect(invalidated).toContain(another.id);
		const manualView = (
			await handlers.get("connections:list")({}, {})
		).data.find((item: any) => item.id === manual.id);
		expect(manualView).toMatchObject({ hasSecret: true, kind: "manual" });

		for (const channel of channels) {
			const result = await handlers.get(channel)({}, "invalid request");
			expect(result).toMatchObject({
				ok: false,
				error: { code: "INVALID_REQUEST" },
			});
			assertNoSecrets(result);
		}

		const unknown = await handlers.get("connections:ssoLogin")(
			{},
			{ profile: "unknown" },
		);
		expect(unknown).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
		assertNoSecrets(unknown);

		sendMode = "failure";
		const failed = await handlers.get("connections:testConnection")(
			{},
			{ id: manual.id },
		);
		expect(failed.error.code).toBe("REQUEST_FAILED");
		assertNoSecrets(failed);

		sendMode = "sso";
		const ssoFailure = await handlers.get("connections:testConnection")(
			{},
			{ id: profile.id },
		);
		expect(ssoFailure).toMatchObject({
			ok: false,
			error: { code: "SSO_LOGIN_REQUIRED", profile: "sso-dev" },
		});
		assertNoSecrets(ssoFailure);
	});

	it("returns success and session-only views when cipher persistence throws", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ipc-cipher-failure-"));
		const cipher: any = {
			isEncryptionAvailable: () => true,
			getSelectedStorageBackend: () => "secure",
			encryptString: () => {
				throw new Error("cipher persistence failure");
			},
			decryptString: (value: Buffer) => value.toString(),
		};
		const vault = new SecretVault(directory, cipher);
		const store = new ConnectionStore(directory, vault);
		const handlers = new Map<string, any>();
		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients: new S3ClientFactory(store, vault) } as any,
		);

		const created = await handlers.get("connections:create")(
			{},
			{
				kind: "manual",
				name: "session-only",
				region: "us-east-1",
				accessKeyId: "AKIAFIXTUREFIXTURE00",
				secretAccessKey: "fixture-secret",
			},
		);
		expect(created).toMatchObject({
			ok: true,
			data: { sessionOnly: true, hasSecret: true },
		});
		assertNoSecrets(JSON.stringify(created));

		const updated = await handlers.get("connections:update")(
			{},
			{
				id: created.data.id,
				accessKeyId: "AKIAUPDATED00000000",
				secretAccessKey: "updated-fixture-secret",
			},
		);
		expect(updated).toMatchObject({
			ok: true,
			data: { sessionOnly: true, hasSecret: true },
		});
		assertNoSecrets(JSON.stringify(updated));
	});

	it("null update values clear connection fields and the stored session token", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ipc-null-update-"));
		const cipher: any = {
			isEncryptionAvailable: () => true,
			getSelectedStorageBackend: () => "secure",
			encryptString: (value: string) => Buffer.from(value),
			decryptString: (value: Buffer) => value.toString(),
		};
		const vault = new SecretVault(directory, cipher);
		const store = new ConnectionStore(directory, vault);
		const handlers = new Map<string, any>();
		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{ store, clients: new S3ClientFactory(store, vault) } as any,
		);
		const connection = await store.create({
			kind: "manual",
			name: "clearable",
			region: "us-east-1",
			endpoint: "https://s3.example.test",
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture-secret",
			sessionToken: "fixture-session",
		});

		const result = await handlers.get("connections:update")(
			{},
			{
				id: connection.id,
				region: null,
				endpoint: null,
				sessionToken: null,
			},
		);
		expect(result.ok).toBe(true);
		expect(result.data).not.toHaveProperty("region");
		expect(result.data).not.toHaveProperty("endpoint");
		expect(await vault.get(connection.id)).toEqual({
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture-secret",
		});
		const records = JSON.parse(
			await (await import("node:fs/promises")).readFile(
				join(directory, "connections.json"),
				"utf8",
			),
		);
		expect(records[0]).not.toHaveProperty("region");
		expect(records[0]).not.toHaveProperty("endpoint");
	});

	it("restores both replacement keys after a session-only secret is lost", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ipc-reentry-"));
		const insecureCipher: any = {
			isEncryptionAvailable: () => true,
			getSelectedStorageBackend: () => "basic_text",
			encryptString: (value: string) => Buffer.from(value),
			decryptString: (value: Buffer) => value.toString(),
		};
		const initialStore = new ConnectionStore(
			directory,
			new SecretVault(directory, insecureCipher),
		);
		const connection = await initialStore.create({
			kind: "manual",
			name: "reentry",
			region: "us-east-1",
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "old-secret",
		});
		const store = new ConnectionStore(
			directory,
			new SecretVault(directory, insecureCipher),
		);
		const handlers = new Map<string, any>();
		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{
				store,
				clients: new S3ClientFactory(
					store,
					new SecretVault(directory, insecureCipher),
				),
			} as any,
		);
		expect((await store.get(connection.id))?.hasSecret).toBe(false);

		const response = await handlers.get("connections:update")(
			{},
			{
				id: connection.id,
				accessKeyId: "AKIAUPDATED00000000",
				secretAccessKey: "replacement-secret",
			},
		);
		expect(response).toMatchObject({ ok: true, data: { hasSecret: true } });
	});

	it("rejects one replacement key when no previous secret exists", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ipc-partial-reentry-"));
		const cipher: any = {
			isEncryptionAvailable: () => true,
			getSelectedStorageBackend: () => "basic_text",
			encryptString: (value: string) => Buffer.from(value),
			decryptString: (value: Buffer) => value.toString(),
		};
		const store = new ConnectionStore(
			directory,
			new SecretVault(directory, cipher),
		);
		const connection = await store.create({
			kind: "manual",
			name: "partial",
			region: "us-east-1",
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "old-secret",
		});
		const restartedStore = new ConnectionStore(
			directory,
			new SecretVault(directory, cipher),
		);
		const handlers = new Map<string, any>();
		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{
				store: restartedStore,
				clients: new S3ClientFactory(
					restartedStore,
					new SecretVault(directory, cipher),
				),
			} as any,
		);

		const response = await handlers.get("connections:update")(
			{},
			{
				id: connection.id,
				secretAccessKey: "replacement-secret",
			},
		);
		expect(response).toMatchObject({
			ok: false,
			error: { code: "INVALID_REQUEST", message: "Both keys are required" },
		});
	});

	it("ignores supplied replacement keys for profile connections", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ipc-profile-keys-"));
		const cipher: any = {
			isEncryptionAvailable: () => true,
			getSelectedStorageBackend: () => "secure",
			encryptString: (value: string) => Buffer.from(value),
			decryptString: (value: Buffer) => value.toString(),
		};
		const vault = new SecretVault(directory, cipher);
		const store = new ConnectionStore(directory, vault);
		const profile = await store.create({
			kind: "profile",
			name: "profile",
			profile: "default",
		});
		const handlers = new Map<string, any>();
		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{
				store,
				clients: new S3ClientFactory(store, vault),
			} as any,
		);
		const response = await handlers.get("connections:update")(
			{},
			{
				id: profile.id,
				accessKeyId: "AKIAFIXTUREFIXTURE00",
				secretAccessKey: "fixture-secret",
			},
		);
		expect(response.ok).toBe(true);
		expect(await vault.get(profile.id)).toBeUndefined();
	});

	it("merges a single replacement key when the previous secret is available", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ipc-merge-key-"));
		const cipher: any = {
			isEncryptionAvailable: () => true,
			getSelectedStorageBackend: () => "secure",
			encryptString: (value: string) => Buffer.from(value),
			decryptString: (value: Buffer) => value.toString(),
		};
		const vault = new SecretVault(directory, cipher);
		const store = new ConnectionStore(directory, vault);
		const connection = await store.create({
			kind: "manual",
			name: "merge",
			region: "us-east-1",
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "old-secret",
		});
		const handlers = new Map<string, any>();
		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{
				store,
				clients: new S3ClientFactory(store, vault),
			} as any,
		);
		const response = await handlers.get("connections:update")(
			{},
			{
				id: connection.id,
				secretAccessKey: "new-secret",
			},
		);
		expect(response.ok).toBe(true);
		expect(await vault.get(connection.id)).toEqual({
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "new-secret",
		});
	});

	it("rejects an unexpected response field through strict response validation", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ipc-extra-"));
		const cipher: any = {
			isEncryptionAvailable: () => true,
			getSelectedStorageBackend: () => "secure",
			encryptString: (value: string) => Buffer.from(value),
			decryptString: (value: Buffer) => value.toString(),
		};
		const vault = new SecretVault(directory, cipher);
		const handlers = new Map<string, any>();
		register(
			{
				handle: (channel: string, listener: any) =>
					handlers.set(channel, listener),
			},
			{
				store: {
					list: async () => [
						{
							id: "id",
							name: "test",
							kind: "manual",
							forcePathStyle: false,
							pinnedBuckets: [],
							extraBuckets: [],
							sessionOnly: false,
							hasSecret: false,
							unexpected: "nope",
						},
					],
				} as any,
				clients: new S3ClientFactory({} as any, vault),
			} as any,
		);
		const result = await handlers.get("connections:list")({}, {});
		expect(result).toMatchObject({
			ok: false,
			error: { code: "REQUEST_FAILED" },
		});
		assertNoSecrets(result);
	});
});
