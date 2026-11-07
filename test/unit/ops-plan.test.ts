import { describe, expect, it } from "vitest";
import {
	batchKeys,
	copySource,
	mapPrefixKey,
	MAX_COPY_BYTES,
	renameObject,
	renamePrefix,
	deleteKeys,
	deletePrefix,
	countPrefix,
	createFolder,
} from "../../src/main/s3/ops";
import { events, channels } from "../../src/shared/channels";
import { eventSchemas, responseSchemas, schemas } from "../../src/shared/ipc";

const client = (fn: (command: { constructor: { name: string }; input: Record<string, unknown> }) => Promise<unknown>) =>
	({ send: fn }) as never;

describe("Phase 4 contract A schemas and pure helpers", () => {
	it.each([0, 1, 999, 1000, 1001, 2500])("deduplicates and splits %i keys", (n) => {
		const keys = Array.from({ length: n }, (_, i) => `k${i}`);
		if (n > 1) keys.push("k0");
		const batches = batchKeys(keys);
		expect(batches.flat()).toEqual(Array.from({ length: n }, (_, i) => `k${i}`));
		expect(batches.every((b) => b.length <= 1000)).toBe(true);
	});
	it("maps keys by prefix slicing without prefix-boundary assumptions", () => {
		expect(mapPrefixKey("root/child/a", "root/child/", "root/")).toBe("root/a");
		expect(mapPrefixKey("a/b/c", "a/", "a/b/")).toBe("a/b/b/c");
	});
	it("encodes copy sources per path segment", () =>
		expect(copySource("bucket", "a space/雪+%25.txt")).toBe("bucket/a%20space/%E9%9B%AA%2B%2525.txt"));
	it.each([
		["same/", "same/"],
		["a/", "a/child/"],
	])("rejects folder move into itself (%s -> %s) before S3", async (from, to) => {
		const calls: string[] = [];
		await expect(
			renamePrefix(
				client(async (c) => {
					calls.push(c.constructor.name);
					return {};
				}),
				"b",
				from,
				to,
			),
		).rejects.toMatchObject({
			code: "INVALID_REQUEST",
			message: "Cannot move a folder into itself",
		});
		expect(calls).toEqual([]);
	});
	it("rejects same key before issuing S3 calls", async () => {
		const calls: string[] = [];
		await expect(
			renameObject(
				client(async (c) => {
					calls.push(c.constructor.name);
					return {};
				}),
				"b",
				"a",
				"a",
			),
		).rejects.toMatchObject({
			code: "INVALID_REQUEST",
			message: "Source and destination are the same",
		});
		expect(calls).toEqual([]);
	});
	it("allows exactly the copy limit and rejects larger source before copying", async () => {
		for (const size of [MAX_COPY_BYTES, MAX_COPY_BYTES + 1]) {
			const calls: string[] = [];
			const s = client(async (c) => {
				calls.push(c.constructor.name);
				if (c.constructor.name === "HeadObjectCommand" && c.input.Key === "src") return { ContentLength: size };
				if (c.constructor.name === "HeadObjectCommand") throw Object.assign(new Error(), { name: "NotFound" });
				return { CopyObjectResult: { ETag: "etag" } };
			});
			if (size === MAX_COPY_BYTES)
				await expect(renameObject(s, "b", "src", "dst")).resolves.toEqual({
					key: "dst",
				});
			else
				await expect(renameObject(s, "b", "src", "dst")).rejects.toMatchObject({
					code: "TOO_LARGE",
				});
			expect(calls.includes("CopyObjectCommand")).toBe(size === MAX_COPY_BYTES);
		}
	});
	it.each(["copy throws", "copy lacks etag", "source head fails", "destination exists"])(
		"does not delete unless copy confirmed (%s)",
		async (scenario) => {
			const calls: string[] = [];
			const s = client(async (c) => {
				calls.push(c.constructor.name);
				if (c.constructor.name === "HeadObjectCommand") {
					if (scenario === "source head fails" && c.input.Key === "src")
						throw Object.assign(new Error(), { name: "NotFound" });
					if (scenario === "destination exists" && c.input.Key === "dst") return {};
					if (c.input.Key === "dst") throw Object.assign(new Error(), { name: "NotFound" });
					return { ContentLength: 2 };
				}
				if (c.constructor.name === "CopyObjectCommand") {
					if (scenario === "copy throws") throw new Error("copy error");
					return scenario === "copy lacks etag" ? {} : { CopyObjectResult: { ETag: "e" } };
				}
				return {};
			});
			if (scenario === "destination exists")
				await expect(renameObject(s, "b", "src", "dst")).rejects.toMatchObject({
					code: "CONFLICT",
				});
			else if (scenario === "source head fails")
				await expect(renameObject(s, "b", "src", "dst")).rejects.toMatchObject({
					code: "NOT_FOUND",
				});
			else
				await expect(renameObject(s, "b", "src", "dst")).rejects.toThrow(
					scenario === "copy lacks etag" ? "Copy not confirmed" : "copy error",
				);
			expect(calls.includes("DeleteObjectCommand")).toBe(false);
			if (scenario === "destination exists") expect(calls.includes("CopyObjectCommand")).toBe(false);
		},
	);
	it("pages rename listings, copies/deletes sequentially, and emits progress counts", async () => {
		const seen: string[] = [];
		let sourcePage = 0;
		const progress: Array<[number, number]> = [];
		const stub = client(async (c) => {
			seen.push(`${c.constructor.name}:${String(c.input.Prefix ?? c.input.Key ?? "")}`);
			if (c.constructor.name === "ListObjectsV2Command") {
				if (c.input.Prefix === "src/") {
					sourcePage++;
					return sourcePage === 1
						? {
								Contents: [{ Key: "src/a", Size: 1 }],
								IsTruncated: true,
								NextContinuationToken: "next",
							}
						: { Contents: [{ Key: "src/b", Size: 2 }], IsTruncated: false };
				}
				return { Contents: [], IsTruncated: false };
			}
			if (c.constructor.name === "CopyObjectCommand") return { CopyObjectResult: { ETag: "ok" } };
			return {};
		});
		await expect(
			renamePrefix(stub, "bucket", "src/", "dst/", (done, total) => progress.push([done, total])),
		).resolves.toEqual({ completed: ["src/a", "src/b"], remaining: [] });
		expect(seen).toEqual([
			"ListObjectsV2Command:src/",
			"ListObjectsV2Command:src/",
			"ListObjectsV2Command:dst/",
			"CopyObjectCommand:dst/a",
			"DeleteObjectCommand:src/a",
			"CopyObjectCommand:dst/b",
			"DeleteObjectCommand:src/b",
		]);
		expect(progress).toEqual([
			[1, 2],
			[2, 2],
		]);
	});
	it("empty folder listing is NOT_FOUND and performs no mutation", async () => {
		const seen: string[] = [];
		await expect(
			renamePrefix(
				client(async (c) => {
					seen.push(c.constructor.name);
					return { Contents: [], IsTruncated: false };
				}),
				"b",
				"src/",
				"dst/",
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(seen).toEqual(["ListObjectsV2Command"]);
	});
	it("preflights oversized objects and mapped destination collisions", async () => {
		for (const scenario of ["large", "collision"]) {
			let copies = 0;
			let _srcPage = 0;
			const stub = client(async (c) => {
				if (c.constructor.name === "ListObjectsV2Command") {
					if (c.input.Prefix === "src/") {
						_srcPage++;
						return {
							Contents: [
								{
									Key: "src/a",
									Size: scenario === "large" ? MAX_COPY_BYTES + 1 : 2,
								},
								{ Key: "src/b", Size: 2 },
							],
							IsTruncated: false,
						};
					}
					return {
						Contents: scenario === "collision" ? [{ Key: "dst/b", Size: 1 }] : [],
						IsTruncated: false,
					};
				}
				if (c.constructor.name === "CopyObjectCommand") copies++;
				return {};
			});
			await expect(renamePrefix(stub, "b", "src/", "dst/")).rejects.toMatchObject({
				code: scenario === "large" ? "TOO_LARGE" : "CONFLICT",
			});
			expect(copies).toBe(0);
		}
	});
	it("catches a mapped destination that collides with an existing source key", async () => {
		const commands: string[] = [];
		const stub = client(async (command) => {
			commands.push(command.constructor.name);
			if (command.constructor.name === "ListObjectsV2Command") {
				return {
					Contents: command.input.Prefix === "a/b/" ? [{ Key: "a/b/c", Size: 1 }] : [{ Key: "a/c", Size: 1 }],
					IsTruncated: false,
				};
			}
			return {};
		});
		await expect(renamePrefix(stub, "b", "a/b/", "a/")).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(commands).toEqual(["ListObjectsV2Command", "ListObjectsV2Command"]);
	});
	it("reports a requested delete key omitted from Deleted as remaining with a fixed failure", async () => {
		const result = await deleteKeys(
			client(async () => ({ Deleted: [{ Key: "a" }] })),
			"b",
			["a", "b"],
		);
		expect(result).toEqual({
			completed: ["a"],
			remaining: ["b"],
			error: { code: "REQUEST_FAILED", message: "Request failed" },
		});
	});
	it("stops prefix rename at the first failed key and reports copy-but-not-delete as remaining", async () => {
		const failingKey = "src/b";
		const events: string[] = [];
		const stub = client(async (c) => {
			events.push(`${c.constructor.name}:${String(c.input.Key ?? "")}`);
			if (c.constructor.name === "ListObjectsV2Command")
				return {
					Contents:
						c.input.Prefix === "src/"
							? [
									{ Key: "src/a", Size: 1 },
									{ Key: "src/b", Size: 1 },
									{ Key: "src/c", Size: 1 },
								]
							: [],
					IsTruncated: false,
				};
			if (c.constructor.name === "CopyObjectCommand") return { CopyObjectResult: { ETag: "e" } };
			if (c.constructor.name === "DeleteObjectCommand" && c.input.Key === failingKey)
				throw Object.assign(new Error("private"), { name: "AccessDenied" });
			return {};
		});
		const report = await renamePrefix(stub, "b", "src/", "dst/");
		expect(report.completed).toEqual(["src/a"]);
		expect(report.remaining).toEqual(["src/b", "src/c"]);
		expect(report.error).toEqual({
			code: "ACCESS_DENIED",
			message: "Access denied",
		});
		expect(events.slice(-2)).toEqual(["CopyObjectCommand:dst/b", "DeleteObjectCommand:src/b"]);
	});
	it("deletes 2500 keys in three calls in sequence and removes duplicates", async () => {
		const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
		const stub = client(async (c) => {
			calls.push({ name: c.constructor.name, input: c.input });
			return {
				Deleted: (c.input.Delete as { Objects: { Key: string }[] }).Objects.map((x) => ({ Key: x.Key })),
			};
		});
		const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);
		keys.push("k0");
		const progress: Array<[number, number]> = [];
		const result = await deleteKeys(stub, "b", keys, (done, total) => progress.push([done, total]));
		expect(progress).toEqual([
			[1000, 2500],
			[2000, 2500],
			[2500, 2500],
		]);
		expect(calls).toHaveLength(3);
		expect(calls.map((x) => (x.input.Delete as { Objects: { Key: string }[] }).Objects.length)).toEqual([
			1000, 1000, 500,
		]);
		expect(result.completed).toHaveLength(2500);
		expect(result.remaining).toEqual([]);
	});
	it("stops delete batches on Errors and on a thrown command with exact remaining", async () => {
		for (const failure of ["errors", "throw"]) {
			let n = 0;
			const stub = client(async (c) => {
				if (c.constructor.name !== "DeleteObjectsCommand") return {};
				n++;
				const requested = (c.input.Delete as { Objects: { Key: string }[] }).Objects.map((x) => x.Key);
				if (n === 1) return { Deleted: requested.map((Key) => ({ Key })) };
				if (failure === "throw")
					throw Object.assign(new Error("unavailable"), {
						name: "AccessDenied",
					});
				return {
					Deleted: [{ Key: "k1000" }],
					Errors: [{ Key: "k1001", Code: "AccessDenied", Message: "hidden" }],
				};
			});
			const keys = Array.from({ length: 2001 }, (_, i) => `k${i}`);
			const report = await deleteKeys(stub, "b", keys);
			expect(n).toBe(2);
			expect(report.completed).toEqual(failure === "errors" ? [...keys.slice(0, 1000), "k1000"] : keys.slice(0, 1000));
			expect(report.remaining).toEqual(failure === "errors" ? [...keys.slice(1001, 2000), "k2000"] : keys.slice(1000));
			expect(report.error?.code).toBe("ACCESS_DENIED");
		}
	});
	it("deletePrefix handles empty listing and listing errors without delete commands", async () => {
		for (const mode of ["empty", "error"]) {
			const commands: string[] = [];
			const stub = client(async (c) => {
				commands.push(c.constructor.name);
				if (c.constructor.name === "ListObjectsV2Command") {
					if (mode === "error") throw Object.assign(new Error("bad"), { name: "AccessDenied" });
					return { Contents: [], IsTruncated: false };
				}
				return { Deleted: [] };
			});
			if (mode === "empty")
				await expect(deletePrefix(stub, "b", "p/")).resolves.toEqual({
					completed: [],
					remaining: [],
				});
			else
				await expect(deletePrefix(stub, "b", "p/")).rejects.toMatchObject({
					code: "ACCESS_DENIED",
				});
			expect(commands).toEqual(["ListObjectsV2Command"]);
		}
	});
	it("deletePrefix lists through all pages before deleting", async () => {
		let page = 0;
		const commands: string[] = [];
		const stub = client(async (command) => {
			commands.push(command.constructor.name);
			if (command.constructor.name === "ListObjectsV2Command") {
				page++;
				return page === 1
					? {
							Contents: [{ Key: "p/a", Size: 1 }],
							IsTruncated: true,
							NextContinuationToken: "page-2",
						}
					: { Contents: [{ Key: "p/b", Size: 1 }], IsTruncated: false };
			}
			return {
				Deleted: (command.input.Delete as { Objects: { Key: string }[] }).Objects.map((item) => ({ Key: item.Key })),
			};
		});
		await expect(deletePrefix(stub, "b", "p/")).resolves.toEqual({
			completed: ["p/a", "p/b"],
			remaining: [],
		});
		expect(commands).toEqual(["ListObjectsV2Command", "ListObjectsV2Command", "DeleteObjectsCommand"]);
	});
	it("counts keys across pages and creates a zero-byte folder marker", async () => {
		let page = 0;
		const stub = client(async (c) => {
			if (c.constructor.name === "ListObjectsV2Command") {
				page++;
				return page === 1
					? { KeyCount: 2, IsTruncated: true, NextContinuationToken: "next" }
					: { KeyCount: 1, IsTruncated: false };
			}
			if (c.constructor.name === "PutObjectCommand") return {};
			return {};
		});
		await expect(countPrefix(stub, "b", "p/")).resolves.toBe(3);
		const put = client(async (c) => {
			expect(c.constructor.name).toBe("PutObjectCommand");
			expect(c.input).toMatchObject({
				Bucket: "b",
				Key: "p/name/",
				Body: "",
				ContentLength: 0,
			});
			return {};
		});
		await expect(createFolder(put, "b", "p/name/")).resolves.toEqual({
			key: "p/name/",
		});
	});
	it("maps a destination head failure and a post-copy delete failure without violating command order", async () => {
		const failures = ["forbidden-destination", "delete"] as const;
		for (const failure of failures) {
			const calls: string[] = [];
			const stub = client(async (c) => {
				calls.push(`${c.constructor.name}:${String(c.input.Key)}`);
				if (c.constructor.name === "HeadObjectCommand") {
					if (c.input.Key === "dst") {
						if (failure === "forbidden-destination")
							throw Object.assign(new Error("denied"), {
								name: "AccessDenied",
							});
						throw Object.assign(new Error(), { name: "NotFound" });
					}
					return { ContentLength: 1 };
				}
				if (c.constructor.name === "CopyObjectCommand") return { CopyObjectResult: { ETag: "etag" } };
				if (c.constructor.name === "DeleteObjectCommand")
					throw Object.assign(new Error("delete fail"), {
						name: "AccessDenied",
					});
				return {};
			});
			await expect(renameObject(stub, "b", "src", "dst")).rejects.toMatchObject({
				code: failure === "delete" ? "ACCESS_DENIED" : "ACCESS_DENIED",
			});
			if (failure === "forbidden-destination") expect(calls.some((x) => x.startsWith("CopyObjectCommand"))).toBe(false);
			else
				expect(calls).toEqual([
					"HeadObjectCommand:src",
					"HeadObjectCommand:dst",
					"CopyObjectCommand:dst",
					"DeleteObjectCommand:src",
				]);
		}
	});
	it("requires every new response and event schema to reject extra fields", () => {
		const responseSamples: Record<string, unknown> = {
			[channels.opsCreateFolder]: { key: "a/" },
			[channels.opsDelete]: { completed: [], remaining: [] },
			[channels.opsDeletePrefix]: { completed: [], remaining: [] },
			[channels.opsCountPrefix]: { count: 0 },
			[channels.opsRename]: { key: "a" },
			[channels.opsRenamePrefix]: { completed: [], remaining: [] },
			[channels.transfersUpload]: { transferIds: [] },
			[channels.transfersUploadPaths]: { transferIds: [], rejectedCount: 0 },
			[channels.transfersDownload]: { transferId: null },
			[channels.transfersCancel]: { cancelled: false },
		};
		for (const [channel, sample] of Object.entries(responseSamples)) {
			expect(responseSchemas[channel as keyof typeof responseSchemas].safeParse(sample).success).toBe(true);
			expect(
				responseSchemas[channel as keyof typeof responseSchemas].safeParse({
					...(sample as Record<string, unknown>),
					extra: true,
				}).success,
			).toBe(false);
		}
		expect(
			responseSchemas[channels.opsDelete].safeParse({
				completed: [],
				remaining: [],
				error: { code: "UNRECOGNIZED", message: "x" },
			}).success,
		).toBe(false);
		const eventSamples: Record<string, unknown> = {
			[events.opsProgress]: { opId: "job-12345678", done: 0, total: 0 },
			[events.transferProgress]: {
				transferId: "id-12345678",
				kind: "upload",
				bucket: "bucket",
				key: "a",
				loaded: 0,
				total: 0,
			},
			[events.transferDone]: { transferId: "id-12345678", status: "completed" },
		};
		for (const [channel, sample] of Object.entries(eventSamples)) {
			expect(eventSchemas[channel as keyof typeof eventSchemas].safeParse(sample).success).toBe(true);
			expect(
				eventSchemas[channel as keyof typeof eventSchemas].safeParse({
					...(sample as Record<string, unknown>),
					extra: true,
				}).success,
			).toBe(false);
		}
		const requestSamples: Record<string, unknown> = {
			[channels.opsCreateFolder]: {
				connectionId: "x",
				bucket: "b",
				parent: "",
				name: "folder",
			},
			[channels.opsDelete]: {
				opId: "job-12345678",
				connectionId: "x",
				bucket: "b",
				keys: ["a"],
			},
			[channels.opsDeletePrefix]: {
				opId: "job-12345678",
				connectionId: "x",
				bucket: "b",
				prefix: "a/",
			},
			[channels.opsCountPrefix]: {
				connectionId: "x",
				bucket: "b",
				prefix: "a/",
			},
			[channels.opsRename]: {
				connectionId: "x",
				bucket: "b",
				fromKey: "a",
				toKey: "b",
			},
			[channels.opsRenamePrefix]: {
				opId: "job-12345678",
				connectionId: "x",
				bucket: "b",
				fromPrefix: "a/",
				toPrefix: "b/",
			},
			[channels.transfersUpload]: {
				connectionId: "x",
				bucket: "b",
				prefix: "",
			},
			[channels.transfersUploadPaths]: {
				connectionId: "x",
				bucket: "b",
				prefix: "",
				paths: ["/tmp/a"],
			},
			[channels.transfersDownload]: {
				connectionId: "x",
				bucket: "b",
				key: "a",
			},
			[channels.transfersCancel]: { transferId: "id-12345678" },
		};
		for (const [channel, sample] of Object.entries(requestSamples))
			expect(schemas[channel as keyof typeof schemas].safeParse(sample).success).toBe(true);
	});
});
