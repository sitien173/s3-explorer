import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SecretVault, ManualSecret } from "./secrets";
export type ConnectionView = {
	id: string;
	name: string;
	kind: "profile" | "manual";
	profile?: string;
	region?: string;
	endpoint?: string;
	forcePathStyle: boolean;
	pinnedBuckets: string[];
	extraBuckets: string[];
	sessionOnly: boolean;
	hasSecret: boolean;
};
type RecordType = Omit<ConnectionView, "sessionOnly" | "hasSecret">;
type Create =
	| {
			kind: "profile";
			name: string;
			profile: string;
			region?: string;
			endpoint?: string;
			forcePathStyle?: boolean;
	  }
	| ({
			kind: "manual";
			name: string;
			region: string;
			endpoint?: string;
			forcePathStyle?: boolean;
	  } & ManualSecret);
export class ConnectionStore {
	private file: string;
	constructor(
		private directory: string,
		private vault: SecretVault,
	) {
		this.file = join(directory, "connections.json");
	}
	private async records(): Promise<RecordType[]> {
		try {
			return JSON.parse(await readFile(this.file, "utf8")) as RecordType[];
		} catch {
			return [];
		}
	}
	private async save(rows: RecordType[]) {
		await mkdir(this.directory, { recursive: true });
		const tmp = `${this.file}.${process.pid}.tmp`;
		await writeFile(tmp, JSON.stringify(rows), { mode: 0o600 });
		await rename(tmp, this.file);
	}
	private async view(r: RecordType): Promise<ConnectionView> {
		const secret = r.kind === "manual" ? await this.vault.get(r.id) : undefined;
		return {
			...r,
			sessionOnly: r.kind === "manual" && Boolean(secret) && !(await this.persisted(r.id)),
			hasSecret: r.kind === "profile" || Boolean(secret),
		};
	}
	private async persisted(id: string) {
		try {
			const data = JSON.parse(await readFile(join(this.directory, "secrets.json"), "utf8")) as Record<string, string>;
			return Boolean(data[id]);
		} catch {
			return false;
		}
	}
	async list() {
		return Promise.all((await this.records()).map((r) => this.view(r)));
	}
	async get(id: string) {
		const r = (await this.records()).find((x) => x.id === id);
		return r ? this.view(r) : undefined;
	}
	async create(input: Create) {
		const { accessKeyId, secretAccessKey, sessionToken, ...rest } = input as Create & ManualSecret;
		const row: RecordType = {
			id: crypto.randomUUID(),
			...rest,
			forcePathStyle: input.forcePathStyle ?? false,
			pinnedBuckets: [],
			extraBuckets: [],
		};
		await this.save([...(await this.records()), row]);
		if (input.kind === "manual")
			await this.vault.set(row.id, {
				accessKeyId: accessKeyId!,
				secretAccessKey: secretAccessKey!,
				...(sessionToken ? { sessionToken } : {}),
			});
		return await this.view(row);
	}
	async update(id: string, patch: Record<string, unknown>) {
		const rows = await this.records();
		const i = rows.findIndex((x) => x.id === id);
		if (i < 0) return undefined;

		const { accessKeyId, secretAccessKey, sessionToken, ...fields } = patch as Partial<ManualSecret> &
			Record<string, unknown>;
		const { region, endpoint, ...recordFields } = fields;
		const current = rows[i];
		let nextSecret: ManualSecret | undefined;

		if (current.kind === "manual") {
			const oldSecret = await this.vault.get(id);
			const hasAccessKey = accessKeyId !== undefined;
			const hasSecretKey = secretAccessKey !== undefined;
			if (hasAccessKey && hasSecretKey) {
				nextSecret = {
					accessKeyId,
					secretAccessKey,
					...(typeof sessionToken === "string" ? { sessionToken } : {}),
				};
			} else if (hasAccessKey || hasSecretKey) {
				if (!oldSecret) {
					throw Object.assign(new Error("Both keys are required"), {
						code: "INVALID_REQUEST",
					});
				}
				nextSecret = {
					accessKeyId: accessKeyId ?? oldSecret.accessKeyId,
					secretAccessKey: secretAccessKey ?? oldSecret.secretAccessKey,
					...(sessionToken === null
						? {}
						: sessionToken !== undefined
							? { sessionToken }
							: oldSecret.sessionToken
								? { sessionToken: oldSecret.sessionToken }
								: {}),
				};
			} else if (oldSecret && sessionToken !== undefined) {
				nextSecret = {
					accessKeyId: oldSecret.accessKeyId,
					secretAccessKey: oldSecret.secretAccessKey,
					...(typeof sessionToken === "string" ? { sessionToken } : {}),
				};
			}
		}

		const updated = { ...current, ...recordFields } as RecordType;
		if (region === null) delete updated.region;
		else if (region !== undefined) updated.region = region as string;
		if (endpoint === null) delete updated.endpoint;
		else if (endpoint !== undefined) updated.endpoint = endpoint as string;
		rows[i] = updated;
		await this.save(rows);
		if (nextSecret) await this.vault.set(id, nextSecret);
		return this.view(rows[i]);
	}
	async delete(id: string) {
		const rows = await this.records();
		if (!rows.some((r) => r.id === id)) return false;
		await this.save(rows.filter((r) => r.id !== id));
		await this.vault.delete(id);
		return true;
	}
}
