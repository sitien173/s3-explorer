import { afterEach, describe, expect, it } from "vitest";
import {
	S3ClientFactory,
	manualCredentialsProvider,
} from "../../src/main/s3/client";

const originalConfig = process.env.AWS_CONFIG_FILE;
const originalCredentials = process.env.AWS_SHARED_CREDENTIALS_FILE;
const originalProfile = process.env.AWS_PROFILE;

function restoreEnvironment() {
	if (originalConfig === undefined) delete process.env.AWS_CONFIG_FILE;
	else process.env.AWS_CONFIG_FILE = originalConfig;
	if (originalCredentials === undefined)
		delete process.env.AWS_SHARED_CREDENTIALS_FILE;
	else process.env.AWS_SHARED_CREDENTIALS_FILE = originalCredentials;
	if (originalProfile === undefined) delete process.env.AWS_PROFILE;
	else process.env.AWS_PROFILE = originalProfile;
}

afterEach(restoreEnvironment);

describe("S3 client factory", () => {
	it("uses the selected profile endpoint and overrides it only when explicitly requested", async () => {
		process.env.AWS_CONFIG_FILE = "test/fixtures/aws/config";
		process.env.AWS_SHARED_CREDENTIALS_FILE = "test/fixtures/aws/credentials";
		delete process.env.AWS_PROFILE;
		const vault: any = {
			get: async () => ({
				accessKeyId: "AKIAFIXTUREFIXTURE00",
				secretAccessKey: "fixture",
			}),
		};
		const factory = new S3ClientFactory({} as any, vault);

		const noEndpoint = await factory.get({
			id: "static",
			kind: "profile",
			profile: "static-keys",
			forcePathStyle: true,
		});
		expect(await (noEndpoint.config as any).endpoint?.()).toBeUndefined();

		const ownEndpoint = await factory.get({
			id: "own",
			kind: "profile",
			profile: "endpoint-profile",
			forcePathStyle: true,
		});
		expect((await (ownEndpoint.config as any).endpoint?.()).hostname).toBe(
			"127.0.0.1",
		);
		expect((await (ownEndpoint.config as any).endpoint?.()).port).toBe(19001);

		const override = await factory.get({
			id: "override",
			kind: "profile",
			profile: "endpoint-profile",
			endpoint: "https://override.example:9443",
			forcePathStyle: true,
		});
		const resolvedOverride = await (override.config as any).endpoint?.();
		expect(resolvedOverride.hostname).toBe("override.example");
		expect(resolvedOverride.port).toBe(9443);
	});

	it("caches by connection id and region, applies configuration, and evicts clients", async () => {
		process.env.AWS_CONFIG_FILE = "test/fixtures/aws/config";
		process.env.AWS_SHARED_CREDENTIALS_FILE = "test/fixtures/aws/credentials";
		const vault: any = {
			get: async () => ({
				accessKeyId: "AKIAFIXTUREFIXTURE00",
				secretAccessKey: "fixture",
			}),
		};
		const factory = new S3ClientFactory({} as any, vault);
		const connection: any = {
			id: "profile",
			kind: "profile",
			profile: "default",
			forcePathStyle: true,
		};
		const first = await factory.get(connection);
		expect(await factory.get(connection)).toBe(first);
		expect(await (first.config as any).region()).toBe("us-east-1");
		expect((first.config as any).forcePathStyle).toBe(true);
		expect((first.config as any).followRegionRedirects).toBe(true);
		const otherRegion = await factory.get({
			...connection,
			region: "us-west-2",
		});
		expect(otherRegion).not.toBe(first);
		expect(await (otherRegion.config as any).region()).toBe("us-west-2");

		let destroyed = false;
		(first as any).destroy = () => {
			destroyed = true;
		};
		factory.invalidate("profile");
		expect(destroyed).toBe(true);
		expect(await factory.get(connection)).not.toBe(first);
	});

	it("reads manual credentials from the vault each time its provider is invoked", async () => {
		let current = {
			accessKeyId: "AKIAFIXTUREFIXTURE00",
			secretAccessKey: "fixture",
		};
		const vault: any = { get: async () => current };
		const provider = manualCredentialsProvider(vault, "manual");
		expect(await provider()).toEqual(current);
		current = {
			accessKeyId: "AKIAUPDATED00000000",
			secretAccessKey: "updated",
		};
		expect(await provider()).toEqual(current);
	});
});
