import { mkdtemp, readFile, stat, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConnectionStore } from "../../src/main/connections/store";
import { SecretVault, type SecretCipher } from "../../src/main/connections/secrets";
const secret = {
	accessKeyId: "AKIAFIXTUREFIXTURE00",
	secretAccessKey: "fixture-secret",
};
function cipher(backend = "gnome-libsecret", available = true): SecretCipher {
	return {
		isEncryptionAvailable: () => available,
		getSelectedStorageBackend: () => backend,
		encryptString: (s) => Buffer.from(s).reverse(),
		decryptString: (b) => Buffer.from(b).reverse().toString(),
	};
}

const tempDirs: string[] = [];

afterEach(async () => {
	for (const dir of tempDirs.splice(0)) {
		await rm(dir, { recursive: true, force: true });
	}
});

async function makeTempDir(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

describe("connection store", () => {
	it("keeps a secret in memory when encryption throws", async () => {
		const directory = await makeTempDir("s3-encrypt-failure-");
		const failingCipher = cipher();
		failingCipher.encryptString = () => {
			throw new Error("cipher persistence failure");
		};
		const vault = new SecretVault(directory, failingCipher);

		expect(await vault.set("connection", secret)).toBe(false);
		expect(await vault.get("connection")).toEqual(secret);
		await expect(access(join(directory, "secrets.json"))).rejects.toThrow();
	});

	it("preserves existing ciphertext when replacement encryption fails", async () => {
		const directory = await makeTempDir("s3-old-ciphertext-");
		const workingCipher = cipher();
		let failEncryption = false;
		workingCipher.encryptString = (value) => {
			if (failEncryption) throw new Error("replacement encryption failed");
			return Buffer.from(value).reverse();
		};
		const vault = new SecretVault(directory, workingCipher);
		await expect(vault.set("connection", secret)).resolves.toBe(true);
		const file = join(directory, "secrets.json");
		const previousCiphertext = await readFile(file, "utf8");
		const replacement = { ...secret, secretAccessKey: "replacement-secret" };
		failEncryption = true;

		expect(await vault.set("connection", replacement)).toBe(false);
		expect(await readFile(file, "utf8")).toBe(previousCiphertext);
		expect(await vault.get("connection")).toEqual(replacement);
	});

	it("keeps a secret in memory when the vault directory cannot be written", async () => {
		const directory = join(tmpdir(), `s3-missing-vault-${crypto.randomUUID()}`);
		const vault = new SecretVault(directory, cipher());

		expect(await vault.set("connection", secret)).toBe(false);
		expect(await vault.get("connection")).toEqual(secret);
		await expect(access(join(directory, "secrets.json"))).rejects.toThrow();
	});
	it("keeps secrets encrypted, session-only when persistence is unsafe, and manages records", async () => {
		const dir = await makeTempDir("s3-store-");
		const vault = new SecretVault(dir, cipher());
		const store = new ConnectionStore(dir, vault);
		await expect(access(join(dir, "connections.json"))).rejects.toThrow();
		const created = await store.create({
			kind: "manual",
			name: "test",
			region: "us-east-1",
			...secret,
		});
		expect(created.hasSecret).toBe(true);
		expect(created.sessionOnly).toBe(false);
		expect(await readFile(join(dir, "secrets.json"), "utf8")).not.toContain(secret.secretAccessKey);
		expect((await stat(join(dir, "connections.json"))).mode & 0o777).toBe(0o600);
		expect((await stat(join(dir, "secrets.json"))).mode & 0o777).toBe(0o600);
		expect(await vault.get(created.id)).toMatchObject(secret);
		await store.update(created.id, { secretAccessKey: "new-secret" });
		expect((await vault.get(created.id))?.secretAccessKey).toBe("new-secret");
		await store.update(created.id, { name: "renamed" });
		expect((await vault.get(created.id))?.secretAccessKey).toBe("new-secret");
		await store.delete(created.id);
		expect(await store.list()).toHaveLength(0);
		expect(await vault.get(created.id)).toBeUndefined();
		for (const c of [cipher("basic_text"), cipher("unknown"), cipher("gnome-libsecret", false)]) {
			const d = await makeTempDir("s3-session-");
			const v = new SecretVault(d, c);
			const s = new ConnectionStore(d, v);
			const row = await s.create({
				kind: "manual",
				name: "session",
				region: "us-east-1",
				...secret,
			});
			expect(row.sessionOnly).toBe(true);
			expect(await v.get(row.id)).toMatchObject(secret);
			await expect(access(join(d, "secrets.json"))).rejects.toThrow();
		}
	});

	it("does not decrypt persisted secrets when persistence is unavailable after restart", async () => {
		const dir = await makeTempDir("s3-restart-");
		const availableCipher = cipher();
		const firstVault = new SecretVault(dir, availableCipher);
		const firstStore = new ConnectionStore(dir, firstVault);
		const created = await firstStore.create({
			kind: "manual",
			name: "persisted",
			region: "us-east-1",
			...secret,
		});
		const unavailableCipher = cipher("basic_text");
		let decryptCalls = 0;
		unavailableCipher.decryptString = () => {
			decryptCalls += 1;
			throw new Error("must not decrypt");
		};
		const restartedStore = new ConnectionStore(dir, new SecretVault(dir, unavailableCipher));
		expect(await restartedStore.get(created.id)).toMatchObject({
			hasSecret: false,
			sessionOnly: false,
		});
		expect(decryptCalls).toBe(0);

		const brokenCipher = cipher();
		brokenCipher.decryptString = () => {
			throw new Error(`unsafe decrypt ${secret.secretAccessKey}`);
		};
		const brokenStore = new ConnectionStore(dir, new SecretVault(dir, brokenCipher));
		expect(await brokenStore.get(created.id)).toMatchObject({
			hasSecret: false,
			sessionOnly: false,
		});
	});
});
