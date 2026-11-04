import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface SecretCipher {
	isEncryptionAvailable(): boolean;
	getSelectedStorageBackend(): string;
	encryptString(plain: string): Buffer;
	decryptString(data: Buffer): string;
}

export type ManualSecret = {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
};

export class SecretVault {
	private readonly memory = new Map<string, ManualSecret>();
	private readonly file: string;

	constructor(
		private readonly directory: string,
		private readonly cipher: SecretCipher,
	) {
		this.file = join(directory, "secrets.json");
	}

	private allowed() {
		return (
			this.cipher.isEncryptionAvailable() &&
			!["basic_text", "unknown"].includes(
				this.cipher.getSelectedStorageBackend(),
			)
		);
	}

	async get(id: string): Promise<ManualSecret | undefined> {
		if (this.memory.has(id)) return this.memory.get(id);
		if (!this.allowed()) return undefined;
		try {
			const data = JSON.parse(await readFile(this.file, "utf8")) as Record<
				string,
				string
			>;
			const encoded = data[id];
			if (!encoded) return undefined;
			const secret = JSON.parse(
				this.cipher.decryptString(Buffer.from(encoded, "base64")),
			) as ManualSecret;
			this.memory.set(id, secret);
			return secret;
		} catch {
			return undefined;
		}
	}

	async set(id: string, secret: ManualSecret): Promise<boolean> {
		this.memory.set(id, secret);
		if (!this.allowed()) return false;

		try {
			const data = await this.read();
			data[id] = this.cipher
				.encryptString(JSON.stringify(secret))
				.toString("base64");
			await this.write(data);
			return true;
		} catch {
			return false;
		}
	}

	async delete(id: string): Promise<void> {
		this.memory.delete(id);
		if (!this.allowed()) return;
		const data = await this.read();
		if (id in data) {
			delete data[id];
			await this.write(data);
		}
	}

	private async read(): Promise<Record<string, string>> {
		try {
			return JSON.parse(await readFile(this.file, "utf8")) as Record<
				string,
				string
			>;
		} catch {
			return {};
		}
	}

	private async write(value: Record<string, string>) {
		const temp = `${this.file}.${process.pid}.tmp`;
		try {
			await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
			await rename(temp, this.file);
		} catch (error) {
			await unlink(temp).catch(() => undefined);
			throw error;
		}
	}
}
