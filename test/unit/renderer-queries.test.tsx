// @vitest-environment jsdom
import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHookWithQuery } from "./render-with-query";

const mocks = vi.hoisted(() => ({
	api: {
		connections: { list: vi.fn(), listProfiles: vi.fn() },
		buckets: { list: vi.fn() },
		objects: { list: vi.fn() },
		ops: { countPrefix: vi.fn() },
		stream: { open: vi.fn() },
	},
}));

vi.mock("../../src/renderer/src/api", () => ({
	api: mocks.api,
	unwrap: (result: { ok: boolean; data?: unknown; error?: { message: string } }) => {
		if (!result.ok) throw new Error(result.error?.message);
		return result.data;
	},
}));

import {
	bucketsQuery,
	connectionsQuery,
	countPrefixQuery,
	createQueryClient,
	invalidateKeys,
	invalidations,
	objectsQuery,
	parentPrefix,
	profilesQuery,
	queryKeys,
	streamOpenQuery,
} from "../../src/renderer/src/queries";

const ok = (data: unknown) => ({ ok: true, data });

beforeEach(() => {
	vi.clearAllMocks();
});

describe("query keys", () => {
	it("starts every connection-scoped key with the connection id", () => {
		const keys: QueryKey[] = [
			queryKeys.connection("c1"),
			queryKeys.buckets("c1"),
			queryKeys.objects("c1"),
			queryKeys.objectList("c1", "b", "p/"),
			queryKeys.countPrefix("c1", "b", "p/"),
			queryKeys.stream("c1", "b", "p/a.txt"),
		];
		for (const key of keys) expect(key[0]).toBe("c1");
	});

	it("nests list keys under bucket and prefix keys under the connection prefix", () => {
		expect(queryKeys.objectList("c1", "b", "p/")).toEqual(["c1", "objects", "b", "p/"]);
		expect(queryKeys.objectList("c1", "b", "p/").slice(0, 2)).toEqual(queryKeys.objects("c1"));
		expect(queryKeys.objectList("c1", "b", "p/")).not.toEqual(queryKeys.objectList("c2", "b", "p/"));
		expect(queryKeys.objectList("c1", "b", "p/")).not.toEqual(queryKeys.objectList("c1", "b2", "p/"));
		expect(queryKeys.objectList("c1", "b", "p/")).not.toEqual(queryKeys.objectList("c1", "b", "q/"));
	});

	it("keeps connection-less channels under their own roots", () => {
		expect(queryKeys.connections()).toEqual(["connections"]);
		expect(queryKeys.profiles()).toEqual(["profiles"]);
	});

	it("gives each query factory the matching key", () => {
		expect(connectionsQuery().queryKey).toEqual(queryKeys.connections());
		expect(profilesQuery().queryKey).toEqual(queryKeys.profiles());
		expect(bucketsQuery("c1").queryKey).toEqual(queryKeys.buckets("c1"));
		expect(objectsQuery({ connectionId: "c1", bucket: "b", prefix: "p/" }).queryKey).toEqual(
			queryKeys.objectList("c1", "b", "p/"),
		);
		expect(countPrefixQuery({ connectionId: "c1", bucket: "b", prefix: "p/" }).queryKey).toEqual(
			queryKeys.countPrefix("c1", "b", "p/"),
		);
		expect(streamOpenQuery({ connectionId: "c1", bucket: "b", key: "a" }).queryKey).toEqual(
			queryKeys.stream("c1", "b", "a"),
		);
	});
});

describe("query functions", () => {
	it("calls the matching api method with the request", async () => {
		const qc = createQueryClient();
		mocks.api.connections.list.mockResolvedValue(ok([{ id: "c1" }]));
		mocks.api.connections.listProfiles.mockResolvedValue(ok([{ name: "p" }]));
		mocks.api.buckets.list.mockResolvedValue(ok({ buckets: [], listDenied: false }));
		mocks.api.ops.countPrefix.mockResolvedValue(ok({ count: 3 }));
		mocks.api.stream.open.mockResolvedValue(ok({ url: "u" }));

		expect(await qc.fetchQuery(connectionsQuery())).toEqual([{ id: "c1" }]);
		expect(await qc.fetchQuery(profilesQuery())).toEqual([{ name: "p" }]);
		expect(await qc.fetchQuery(bucketsQuery("c1"))).toEqual({ buckets: [], listDenied: false });
		expect(mocks.api.buckets.list).toHaveBeenCalledWith({ connectionId: "c1" });
		expect(await qc.fetchQuery(countPrefixQuery({ connectionId: "c1", bucket: "b", prefix: "p/" }))).toEqual({
			count: 3,
		});
		expect(mocks.api.ops.countPrefix).toHaveBeenCalledWith({ connectionId: "c1", bucket: "b", prefix: "p/" });
		await qc.fetchQuery(streamOpenQuery({ connectionId: "c1", bucket: "b", key: "a" }));
		expect(mocks.api.stream.open).toHaveBeenCalledWith({ connectionId: "c1", bucket: "b", key: "a" });
	});

	it("caches streamOpen results forever", () => {
		expect(streamOpenQuery({ connectionId: "c1", bucket: "b", key: "a" }).staleTime).toBe(Number.POSITIVE_INFINITY);
	});

	it("rejects with the unwrapped error", async () => {
		mocks.api.buckets.list.mockResolvedValue({ ok: false, error: { message: "denied" } });
		await expect(createQueryClient().fetchQuery(bucketsQuery("c1"))).rejects.toThrow("denied");
	});
});

describe("object listing infinite query", () => {
	it("follows nextToken until it is absent", async () => {
		mocks.api.objects.list
			.mockResolvedValueOnce(ok({ folders: ["a/"], objects: [], nextToken: "t1" }))
			.mockResolvedValueOnce(ok({ folders: [], objects: [{ key: "x", size: 1 }] }));
		const qc = createQueryClient();
		const { result } = renderHookWithQuery(
			() => useInfiniteQuery(objectsQuery({ connectionId: "c1", bucket: "b", prefix: "" })),
			qc,
		);
		await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
		expect(mocks.api.objects.list).toHaveBeenLastCalledWith({ connectionId: "c1", bucket: "b", prefix: "" });
		expect(result.current.hasNextPage).toBe(true);
		await result.current.fetchNextPage();
		await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
		expect(mocks.api.objects.list).toHaveBeenLastCalledWith({
			connectionId: "c1",
			bucket: "b",
			prefix: "",
			token: "t1",
		});
		expect(result.current.hasNextPage).toBe(false);
	});

	it("refetches only the first page after invalidating a deeply scrolled 3-page listing", async () => {
		const fetchedPages: (string | undefined)[] = [];
		mocks.api.objects.list.mockImplementation(async (req: { token?: string }) => {
			fetchedPages.push(req.token);
			const token = req.token;
			const nextToken = token === undefined ? "t1" : token === "t1" ? "t2" : undefined;
			return ok({ folders: [], objects: [{ key: `item-${token ?? "0"}`, size: 1 }], nextToken });
		});
		const qc = createQueryClient();
		const { result } = renderHookWithQuery(
			() => useInfiniteQuery(objectsQuery({ connectionId: "c1", bucket: "b", prefix: "" })),
			qc,
		);
		await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
		await result.current.fetchNextPage();
		await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
		await result.current.fetchNextPage();
		await waitFor(() => expect(result.current.data?.pages).toHaveLength(3));
		expect(fetchedPages).toEqual([undefined, "t1", "t2"]);

		fetchedPages.length = 0;
		await invalidateKeys(qc, [queryKeys.objectList("c1", "b", "")]);
		await waitFor(() => expect(fetchedPages.length).toBeGreaterThan(0));
		expect(fetchedPages).toEqual([undefined]);
		expect(result.current.data?.pages).toHaveLength(1);
	});

	it("keeps rows rendered and isLoading false during object listing invalidation", async () => {
		let resolveList: ((val: unknown) => void) | null = null;
		mocks.api.objects.list.mockImplementation(
			async () =>
				new Promise((resolve) => {
					resolveList = resolve;
				}),
		);
		const qc = createQueryClient();
		qc.setQueryData(queryKeys.objectList("c1", "b", ""), {
			pages: [{ folders: [], objects: [{ key: "o1", size: 1 }] }],
			pageParams: [undefined],
		});
		const { result } = renderHookWithQuery(
			() => useInfiniteQuery(objectsQuery({ connectionId: "c1", bucket: "b", prefix: "" })),
			qc,
		);
		expect(result.current.isLoading).toBe(false);
		expect(result.current.data?.pages[0].objects[0].key).toBe("o1");

		const invalidatePromise = invalidateKeys(qc, [queryKeys.objectList("c1", "b", "")]);
		expect(result.current.isLoading).toBe(false);
		expect(result.current.data?.pages[0].objects[0].key).toBe("o1");

		resolveList!(ok({ folders: [], objects: [{ key: "o1-updated", size: 1 }] }));
		await invalidatePromise;
		await waitFor(() => expect(result.current.data?.pages[0].objects[0].key).toBe("o1-updated"));
		expect(result.current.isLoading).toBe(false);
	});

	it("caches each prefix separately", async () => {
		mocks.api.objects.list.mockImplementation(async ({ prefix }: { prefix: string }) =>
			ok({ folders: [], objects: [{ key: `${prefix}f`, size: 1 }] }),
		);
		const qc = createQueryClient();
		await qc.fetchInfiniteQuery(objectsQuery({ connectionId: "c1", bucket: "b", prefix: "a/" }));
		await qc.fetchInfiniteQuery(objectsQuery({ connectionId: "c1", bucket: "b", prefix: "b/" }));
		const a = qc.getQueryData(queryKeys.objectList("c1", "b", "a/")) as { pages: { objects: { key: string }[] }[] };
		const b = qc.getQueryData(queryKeys.objectList("c1", "b", "b/")) as { pages: { objects: { key: string }[] }[] };
		expect(a.pages[0].objects[0].key).toBe("a/f");
		expect(b.pages[0].objects[0].key).toBe("b/f");
	});
});

describe("createQueryClient", () => {
	it("does not retry or refetch on focus", () => {
		const defaults = createQueryClient().getDefaultOptions().queries;
		expect(defaults?.retry).toBe(false);
		expect(defaults?.refetchOnWindowFocus).toBe(false);
	});
});

describe("parentPrefix", () => {
	it("returns the folder prefix that lists the key or prefix", () => {
		expect(parentPrefix("a.txt")).toBe("");
		expect(parentPrefix("a/b/c.txt")).toBe("a/b/");
		expect(parentPrefix("a/b/")).toBe("a/");
		expect(parentPrefix("a/")).toBe("");
	});
});

describe("mutation invalidation keys", () => {
	it("create bucket invalidates only the bucket list of that connection", () => {
		expect(invalidations.createBucket("c1")).toEqual([queryKeys.buckets("c1")]);
	});

	it("delete bucket invalidates the bucket list and that bucket's listings", () => {
		expect(invalidations.deleteBucket("c1", "b")).toEqual([queryKeys.buckets("c1"), ["c1", "objects", "b"]]);
	});

	it("pin, unpin, and add refresh the connection list and bucket list", () => {
		const expected = [queryKeys.connections(), queryKeys.buckets("c1")];
		expect(invalidations.pinBucket("c1")).toEqual(expected);
		expect(invalidations.addBucket("c1")).toEqual(expected);
	});

	it("connection create and update refresh the connection list; delete also drops its scope", () => {
		expect(invalidations.saveConnection()).toEqual([queryKeys.connections()]);
		expect(invalidations.deleteConnection("c1")).toEqual([queryKeys.connections(), queryKeys.connection("c1")]);
	});

	it("create folder invalidates the parent listing", () => {
		expect(invalidations.createFolder("c1", "b", "p/")).toEqual([queryKeys.objectList("c1", "b", "p/")]);
	});

	it("delete objects invalidates each distinct parent listing and prefix counts", () => {
		expect(invalidations.deleteObjects("c1", "b", ["a/1", "a/2", "b/3", "root"])).toEqual([
			queryKeys.objectList("c1", "b", "a/"),
			queryKeys.objectList("c1", "b", "b/"),
			queryKeys.objectList("c1", "b", ""),
			queryKeys.countPrefixes("c1", "b"),
		]);
	});

	it("delete prefix invalidates the parent listing and prefix counts", () => {
		expect(invalidations.deletePrefix("c1", "b", "a/b/")).toEqual([
			queryKeys.objectList("c1", "b", "a/"),
			queryKeys.countPrefixes("c1", "b"),
		]);
	});

	it("rename invalidates the source and destination parents once", () => {
		expect(invalidations.rename("c1", "b", "a/x", "a/y")).toEqual([queryKeys.objectList("c1", "b", "a/")]);
		expect(invalidations.rename("c1", "b", "a/x", "z/x")).toEqual([
			queryKeys.objectList("c1", "b", "a/"),
			queryKeys.objectList("c1", "b", "z/"),
		]);
		expect(invalidations.renamePrefix("c1", "b", "a/x/", "z/x/")).toEqual([
			queryKeys.objectList("c1", "b", "a/"),
			queryKeys.objectList("c1", "b", "z/"),
			queryKeys.countPrefixes("c1", "b"),
		]);
	});

	it("upload invalidates the destination listing", () => {
		expect(invalidations.upload("c1", "b", "p/")).toEqual([queryKeys.objectList("c1", "b", "p/")]);
	});
});

describe("targeted invalidation", () => {
	it("marks only the matching listings stale", async () => {
		mocks.api.objects.list.mockImplementation(async () => ok({ folders: [], objects: [] }));
		const qc = createQueryClient();
		const opts = (c: string, b: string, prefix: string) => objectsQuery({ connectionId: c, bucket: b, prefix });
		await qc.fetchInfiniteQuery(opts("c1", "b", "a/"));
		await qc.fetchInfiniteQuery(opts("c1", "b", "z/"));
		await qc.fetchInfiniteQuery(opts("c1", "b2", "a/"));
		await qc.fetchInfiniteQuery(opts("c2", "b", "a/"));
		await invalidateKeys(qc, invalidations.deleteObjects("c1", "b", ["a/x"]));
		const stale = (c: string, b: string, p: string) => qc.getQueryState(queryKeys.objectList(c, b, p))?.isInvalidated;
		expect(stale("c1", "b", "a/")).toBe(true);
		expect(stale("c1", "b", "z/")).toBe(false);
		expect(stale("c1", "b2", "a/")).toBe(false);
		expect(stale("c2", "b", "a/")).toBe(false);
	});

	it("invalidates a whole connection by its id prefix", async () => {
		mocks.api.objects.list.mockImplementation(async () => ok({ folders: [], objects: [] }));
		mocks.api.buckets.list.mockResolvedValue(ok({ buckets: [], listDenied: false }));
		const qc = createQueryClient();
		await qc.fetchInfiniteQuery(objectsQuery({ connectionId: "c1", bucket: "b", prefix: "" }));
		await qc.fetchQuery(bucketsQuery("c1"));
		await qc.fetchQuery(bucketsQuery("c2"));
		await invalidateKeys(qc, [queryKeys.connection("c1")]);
		expect(qc.getQueryState(queryKeys.objectList("c1", "b", ""))?.isInvalidated).toBe(true);
		expect(qc.getQueryState(queryKeys.buckets("c1"))?.isInvalidated).toBe(true);
		expect(qc.getQueryState(queryKeys.buckets("c2"))?.isInvalidated).toBe(false);
	});
});
