import { describe, expect, it } from "vitest";
import { HandleRegistry, MAX_HANDLES, type HandleTarget } from "../../src/main/stream/handles";

const s3Target: HandleTarget = {
	kind: "s3",
	connectionId: "connection-1",
	bucket: "media",
	key: "films/clip.mp4",
};

describe("HandleRegistry", () => {
	it("creates 32-character lowercase hexadecimal handles", () => {
		const registry = new HandleRegistry();
		const handle = registry.create(s3Target);
		expect(handle).toMatch(/^[0-9a-f]{32}$/);
		expect(registry.get(handle)).toEqual(s3Target);
	});

	it("creates 1,000 distinct handles for distinct targets", () => {
		const registry = new HandleRegistry();
		const handles = new Set<string>();
		for (let index = 0; index < 1000; index += 1) {
			handles.add(
				registry.create({
					kind: "s3",
					connectionId: "connection-1",
					bucket: "media",
					key: `object-${index}`,
				}),
			);
		}
		expect(handles.size).toBe(1000);
		expect(registry.size).toBe(1000);
	});

	it("deduplicates structurally identical S3 targets", () => {
		const registry = new HandleRegistry();
		const first = registry.create(s3Target);
		const second = registry.create({
			key: "films/clip.mp4",
			bucket: "media",
			connectionId: "connection-1",
			kind: "s3",
		});
		expect(second).toBe(first);
		expect(registry.size).toBe(1);
	});

	it("deduplicates identical pass-through targets", () => {
		const registry = new HandleRegistry();
		const target: HandleTarget = {
			kind: "passthrough",
			url: "https://media.example/clip.mp4?signature=secret",
		};
		expect(registry.create(target)).toBe(registry.create({ ...target }));
		expect(registry.size).toBe(1);
	});

	it("keeps different target kinds distinct", () => {
		const registry = new HandleRegistry();
		const s3Handle = registry.create(s3Target);
		const passHandle = registry.create({ kind: "passthrough", url: "media" });
		expect(passHandle).not.toBe(s3Handle);
		expect(registry.size).toBe(2);
	});

	it("returns undefined for an unknown valid-looking handle", () => {
		expect(new HandleRegistry().get("00000000000000000000000000000000")).toBe(undefined);
	});

	it.each([
		"",
		"__proto__",
		"short",
		"0000000000000000000000000000000",
		"000000000000000000000000000000000",
		"0000000000000000000000000000000g",
	])("returns undefined for malformed handle %j", (handle) => {
		const registry = new HandleRegistry();
		registry.create(s3Target);
		expect(registry.get(handle)).toBeUndefined();
	});

	it("rejects the uppercase form of a known handle", () => {
		const registry = new HandleRegistry();
		const handle = registry.create(s3Target);
		expect(registry.get(handle)).toBeDefined();
		const uppercaseHandle = /[a-f]/.test(handle) ? handle.toUpperCase() : "ABCDEF0123456789ABCDEF0123456789";
		expect(registry.get(uppercaseHandle)).toBeUndefined();
	});

	it("clears all entries", () => {
		const registry = new HandleRegistry();
		const handle = registry.create(s3Target);
		registry.create({ kind: "passthrough", url: "https://media.example/item" });
		expect(registry.size).toBe(2);
		registry.clear();
		expect(registry.size).toBe(0);
		expect(registry.get(handle)).toBeUndefined();
	});

	it("has a capacity of 1,024 and evicts the least recently used entry on the 1,025th target", () => {
		expect(MAX_HANDLES).toBe(1024);
		const registry = new HandleRegistry();
		const handles: string[] = [];
		for (let index = 0; index < MAX_HANDLES; index += 1) {
			handles.push(
				registry.create({
					kind: "s3",
					connectionId: "connection-1",
					bucket: "media",
					key: `object-${index}`,
				}),
			);
		}
		expect(registry.size).toBe(1024);
		const extraHandle = registry.create({
			kind: "s3",
			connectionId: "connection-1",
			bucket: "media",
			key: "object-1024",
		});
		expect(registry.size).toBe(1024);
		expect(registry.get(handles[0])).toBeUndefined();
		expect(registry.get(handles[1])).toBeDefined();
		expect(registry.get(extraHandle)).toBeDefined();
	});

	it("touches an entry on get so that it is spared from eviction", () => {
		const registry = new HandleRegistry();
		const handles: string[] = [];
		for (let index = 0; index < MAX_HANDLES; index += 1) {
			handles.push(
				registry.create({
					kind: "s3",
					connectionId: "connection-1",
					bucket: "media",
					key: `object-${index}`,
				}),
			);
		}
		expect(registry.get(handles[0])).toBeDefined();
		const extraHandle = registry.create({
			kind: "s3",
			connectionId: "connection-1",
			bucket: "media",
			key: "object-extra",
		});
		expect(registry.get(handles[0])).toBeDefined();
		expect(registry.get(handles[1])).toBeUndefined();
		expect(registry.get(extraHandle)).toBeDefined();
	});

	it("touches an entry on a dedupe hit in create so that it is spared from eviction", () => {
		const registry = new HandleRegistry();
		const targets: HandleTarget[] = [];
		const handles: string[] = [];
		for (let index = 0; index < MAX_HANDLES; index += 1) {
			const target: HandleTarget = {
				kind: "s3",
				connectionId: "connection-1",
				bucket: "media",
				key: `object-${index}`,
			};
			targets.push(target);
			handles.push(registry.create(target));
		}
		const deduped = registry.create(targets[0]);
		expect(deduped).toBe(handles[0]);
		const extraHandle = registry.create({
			kind: "s3",
			connectionId: "connection-1",
			bucket: "media",
			key: "object-extra",
		});
		expect(registry.get(handles[0])).toBeDefined();
		expect(registry.get(handles[1])).toBeUndefined();
		expect(registry.get(extraHandle)).toBeDefined();
	});

	it("assigns a new handle to an evicted target on create and old handle remains undefined", () => {
		const registry = new HandleRegistry();
		const target0: HandleTarget = {
			kind: "s3",
			connectionId: "connection-1",
			bucket: "media",
			key: "object-0",
		};
		const handle0 = registry.create(target0);
		for (let index = 1; index <= MAX_HANDLES; index += 1) {
			registry.create({
				kind: "s3",
				connectionId: "connection-1",
				bucket: "media",
				key: `object-${index}`,
			});
		}
		expect(registry.get(handle0)).toBeUndefined();
		const newHandle0 = registry.create(target0);
		expect(newHandle0).not.toBe(handle0);
		expect(registry.get(handle0)).toBeUndefined();
		expect(registry.get(newHandle0)).toEqual(target0);
	});
});
