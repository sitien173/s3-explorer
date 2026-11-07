// @vitest-environment jsdom
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHookWithQuery } from "./render-with-query";

const mocks = vi.hoisted(() => ({
	api: {
		connections: { list: vi.fn(), listProfiles: vi.fn() },
		buckets: { list: vi.fn(), pin: vi.fn(), unpin: vi.fn(), create: vi.fn(), delete: vi.fn() },
		objects: { list: vi.fn() },
		ops: { countPrefix: vi.fn() },
	},
}));

vi.mock("../../src/renderer/src/api", () => ({
	api: mocks.api,
	IpcErrorWrapper: class extends Error {},
	unwrap: (r: any) => {
		if (!r.ok) throw new Error(r.error?.message ?? "failed");
		return r.data;
	},
}));

vi.mock("../../src/renderer/src/components/CreateBucketDialog", () => ({
	CreateBucketDialog: ({ open, onCreated }: any) =>
		open ? <button onClick={() => onCreated("new-bucket", undefined)}>finish create</button> : null,
}));

import { ObjectTable } from "../../src/renderer/src/components/ObjectTable";
import { Sidebar } from "../../src/renderer/src/components/Sidebar";
import {
	bucketsQuery,
	connectionsQuery,
	createQueryClient,
	invalidateKeys,
	invalidations,
	objectsQuery,
} from "../../src/renderer/src/queries";

afterEach(() => cleanup());

beforeEach(() => {
	vi.clearAllMocks();
	Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 400 });
	Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

const listing = (key: string) => ({
	ok: true,
	data: { folders: [], objects: [{ key, size: 1, lastModified: "2026-01-01" }] },
});

describe("stale listings", () => {
	it("never shows the listing of a prefix the user has already left", async () => {
		const first = deferred<unknown>();
		const second = deferred<unknown>();
		mocks.api.objects.list.mockImplementation(({ prefix }: { prefix: string }) =>
			prefix === "a/" ? first.promise : second.promise,
		);
		const view = render(<ObjectTable connectionId="c" bucket="b" prefix="a/" onNavigate={vi.fn()} />);
		await waitFor(() => expect(mocks.api.objects.list).toHaveBeenCalledTimes(1));
		view.rerender(<ObjectTable connectionId="c" bucket="b" prefix="b/" onNavigate={vi.fn()} />);
		await waitFor(() => expect(mocks.api.objects.list).toHaveBeenCalledTimes(2));

		await act(async () => second.resolve(listing("b/new.txt")));
		expect(await screen.findByText("new.txt")).toBeTruthy();

		await act(async () => first.resolve(listing("a/old.txt")));
		await waitFor(() => expect(screen.getByRole("grid").getAttribute("aria-busy")).not.toBe("true"));
		expect(screen.queryByText("old.txt")).toBeNull();
		expect(screen.getByText("new.txt")).toBeTruthy();
	});
});

describe("create bucket", () => {
	it("refetches the buckets list of the connection", async () => {
		const connection = { id: "c1", name: "Conn", kind: "manual" };
		mocks.api.connections.list.mockResolvedValue({ ok: true, data: [connection] });
		mocks.api.buckets.list
			.mockResolvedValueOnce({ ok: true, data: { buckets: [], listDenied: false } })
			.mockResolvedValue({ ok: true, data: { buckets: [{ name: "new-bucket", pinned: false }], listDenied: false } });
		const user = userEvent.setup();
		render(
			<Sidebar
				selectedConnectionId="c1"
				selectedBucket={null}
				onSelectConnection={vi.fn()}
				onSelectBucket={vi.fn()}
				onOpenAddConnection={vi.fn()}
				onOpenEditConnection={vi.fn()}
				onBucketDeleted={vi.fn()}
			/>,
		);
		await waitFor(() => expect(mocks.api.buckets.list).toHaveBeenCalledTimes(1));
		await user.click(await screen.findByRole("button", { name: /new bucket/i }));
		await user.click(await screen.findByRole("button", { name: "finish create" }));
		await waitFor(() => expect(mocks.api.buckets.list).toHaveBeenCalledTimes(2));
		expect(await screen.findByText("new-bucket")).toBeTruthy();
	});

	it("leaves the connections list and other connections' buckets alone", async () => {
		mocks.api.connections.list.mockResolvedValue({ ok: true, data: [] });
		mocks.api.buckets.list.mockResolvedValue({ ok: true, data: { buckets: [], listDenied: false } });
		const qc = createQueryClient();
		renderHookWithQuery(
			() => [useQuery(connectionsQuery()), useQuery(bucketsQuery("c1")), useQuery(bucketsQuery("c2"))],
			qc,
		);
		await waitFor(() => expect(mocks.api.buckets.list).toHaveBeenCalledTimes(2));
		await act(() => invalidateKeys(qc, invalidations.createBucket("c1")));
		await waitFor(() => expect(mocks.api.buckets.list).toHaveBeenCalledTimes(3));
		expect(mocks.api.buckets.list).toHaveBeenLastCalledWith({ connectionId: "c1" });
		expect(mocks.api.connections.list).toHaveBeenCalledTimes(1);
	});
});

describe("object mutations", () => {
	const scope = (prefix: string) => ({ connectionId: "c1", bucket: "b", prefix });

	function observeListings(qc: ReturnType<typeof createQueryClient>) {
		mocks.api.objects.list.mockResolvedValue({ ok: true, data: { folders: [], objects: [] } });
		renderHookWithQuery(
			() => [
				useInfiniteQuery(objectsQuery(scope("docs/"))),
				useInfiniteQuery(objectsQuery(scope("docs/sub/"))),
				useInfiniteQuery(objectsQuery(scope("other/"))),
			],
			qc,
		);
		return waitFor(() => expect(mocks.api.objects.list).toHaveBeenCalledTimes(3));
	}

	const refetchedPrefixes = () => mocks.api.objects.list.mock.calls.slice(3).map(([request]) => request.prefix);

	it("deleting objects refetches the listing that contains them and no other", async () => {
		const qc = createQueryClient();
		await observeListings(qc);
		await act(() => invalidateKeys(qc, invalidations.deleteObjects("c1", "b", ["docs/sub/a.txt"])));
		await waitFor(() => expect(refetchedPrefixes()).toContain("docs/sub/"));
		expect(refetchedPrefixes()).not.toContain("other/");
	});

	it("renaming refetches the source and destination listings and no other", async () => {
		const qc = createQueryClient();
		await observeListings(qc);
		await act(() => invalidateKeys(qc, invalidations.rename("c1", "b", "docs/sub/a.txt", "docs/a.txt")));
		await waitFor(() => expect(refetchedPrefixes().sort()).toEqual(["docs/", "docs/sub/"]));
		expect(refetchedPrefixes()).not.toContain("other/");
	});
});
