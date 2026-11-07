import { afterAll, describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConnectionStore } from "../../src/main/connections/store";
import { SecretVault } from "../../src/main/connections/secrets";
import { S3ClientFactory } from "../../src/main/s3/client";
import { ListBucketsCommand } from "@aws-sdk/client-s3";
const oldConfig = process.env.AWS_CONFIG_FILE,
	oldCred = process.env.AWS_SHARED_CREDENTIALS_FILE;
afterAll(() => {
	if (oldConfig === undefined) delete process.env.AWS_CONFIG_FILE;
	else process.env.AWS_CONFIG_FILE = oldConfig;
	if (oldCred === undefined) delete process.env.AWS_SHARED_CREDENTIALS_FILE;
	else process.env.AWS_SHARED_CREDENTIALS_FILE = oldCred;
});
describe("RustFS S3 factory integration", () => {
	it("lists buckets through manual and profile connections", async () => {
		const dir = await mkdtemp(join(tmpdir(), "s3-integration-"));
		const cipher: any = {
			isEncryptionAvailable: () => true,
			getSelectedStorageBackend: () => "secure",
			encryptString: (s: string) => Buffer.from(s),
			decryptString: (b: Buffer) => b.toString(),
		};
		const vault = new SecretVault(dir, cipher),
			store = new ConnectionStore(dir, vault),
			factory = new S3ClientFactory(store, vault);
		const manual = await store.create({
			kind: "manual",
			name: "manual",
			region: "us-east-1",
			endpoint: "http://127.0.0.1:19000",
			forcePathStyle: true,
			accessKeyId: "rustfsadmin",
			secretAccessKey: "rustfsadmin",
		});
		expect((await (await factory.get(manual)).send(new ListBucketsCommand({}))).Buckets).toBeDefined();
		const aws = await mkdtemp(join(tmpdir(), "aws-fixture-")),
			cfg = join(aws, "config"),
			cred = join(aws, "credentials");
		await writeFile(cfg, ["[profile rust]", "region=us-east-1", "endpoint_url=http://127.0.0.1:19000", ""].join("\n"));
		await writeFile(
			cred,
			["[rust]", "aws_access_key_id=rustfsadmin", "aws_secret_access_key=rustfsadmin", ""].join("\n"),
		);
		process.env.AWS_CONFIG_FILE = cfg;
		process.env.AWS_SHARED_CREDENTIALS_FILE = cred;
		const profile = await store.create({
			kind: "profile",
			name: "profile",
			profile: "rust",
			region: "us-east-1",
		});
		expect((await (await factory.get(profile)).send(new ListBucketsCommand({}))).Buckets).toBeDefined();
	});
});
