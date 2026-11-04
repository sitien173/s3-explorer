import { randomBytes } from "node:crypto";

export type HandleTarget =
	| { kind: "s3"; connectionId: string; bucket: string; key: string }
	| { kind: "passthrough"; url: string };

function targetKey(target: HandleTarget): string {
	if (target.kind === "s3") {
		return JSON.stringify([
			target.kind,
			target.connectionId,
			target.bucket,
			target.key,
		]);
	}
	return JSON.stringify([target.kind, target.url]);
}

function copyTarget(target: HandleTarget): HandleTarget {
	if (target.kind === "s3") {
		return {
			kind: "s3",
			connectionId: target.connectionId,
			bucket: target.bucket,
			key: target.key,
		};
	}
	return { kind: "passthrough", url: target.url };
}

export class HandleRegistry {
	private readonly targetsByHandle = new Map<string, HandleTarget>();
	private readonly handlesByTarget = new Map<string, string>();

	create(target: HandleTarget): string {
		const identity = targetKey(target);
		const existing = this.handlesByTarget.get(identity);
		if (existing) return existing;

		let handle: string;
		do {
			handle = randomBytes(16).toString("hex");
		} while (this.targetsByHandle.has(handle));

		this.targetsByHandle.set(handle, copyTarget(target));
		this.handlesByTarget.set(identity, handle);
		return handle;
	}

	get(handle: string): HandleTarget | undefined {
		if (!/^[0-9a-f]{32}$/.test(handle)) return undefined;
		return this.targetsByHandle.get(handle);
	}

	get size(): number {
		return this.targetsByHandle.size;
	}

	clear(): void {
		this.targetsByHandle.clear();
		this.handlesByTarget.clear();
	}
}
