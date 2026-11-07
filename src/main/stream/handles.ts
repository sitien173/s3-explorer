import { randomBytes } from "node:crypto";

export const MAX_HANDLES = 1024;

export type HandleTarget =
	| { kind: "s3"; connectionId: string; bucket: string; key: string }
	| { kind: "passthrough"; url: string };

function targetKey(target: HandleTarget): string {
	if (target.kind === "s3") {
		return JSON.stringify([target.kind, target.connectionId, target.bucket, target.key]);
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

	private touch(handle: string, target: HandleTarget, identity: string): void {
		this.targetsByHandle.delete(handle);
		this.targetsByHandle.set(handle, target);
		this.handlesByTarget.delete(identity);
		this.handlesByTarget.set(identity, handle);
	}

	create(target: HandleTarget): string {
		const identity = targetKey(target);
		const existing = this.handlesByTarget.get(identity);
		if (existing) {
			const existingTarget = this.targetsByHandle.get(existing);
			if (existingTarget) {
				this.touch(existing, existingTarget, identity);
			}
			return existing;
		}

		if (this.targetsByHandle.size >= MAX_HANDLES) {
			const oldestHandle = this.targetsByHandle.keys().next().value;
			if (oldestHandle !== undefined) {
				const oldestTarget = this.targetsByHandle.get(oldestHandle);
				if (oldestTarget) {
					this.handlesByTarget.delete(targetKey(oldestTarget));
				}
				this.targetsByHandle.delete(oldestHandle);
			}
		}

		let handle: string;
		do {
			handle = randomBytes(16).toString("hex");
		} while (this.targetsByHandle.has(handle));

		const copied = copyTarget(target);
		this.targetsByHandle.set(handle, copied);
		this.handlesByTarget.set(identity, handle);
		return handle;
	}

	get(handle: string): HandleTarget | undefined {
		if (!/^[0-9a-f]{32}$/.test(handle)) return undefined;
		const target = this.targetsByHandle.get(handle);
		if (!target) return undefined;
		const identity = targetKey(target);
		this.touch(handle, target, identity);
		return target;
	}

	get size(): number {
		return this.targetsByHandle.size;
	}

	clear(): void {
		this.targetsByHandle.clear();
		this.handlesByTarget.clear();
	}
}
