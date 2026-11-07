import { describe, expect, it } from "vitest";

interface TransferStateModule {
	updateTransfersOnProgress(prev: any[], payload: any): any[];
	updateTransfersOnDone(prev: any[], payload: any, meta?: any): any[];
	shouldClearViewerTarget(target: any, item: any, connectionId: string | null, bucket: string | null): boolean;
}

const modulePath = "../../src/renderer/src/App";
const { updateTransfersOnProgress, updateTransfersOnDone, shouldClearViewerTarget } = (await import(
	modulePath
)) as TransferStateModule;

describe("transferState", () => {
	describe("updateTransfersOnProgress", () => {
		it("adds a new running transfer record when not present", () => {
			const initial: any[] = [];
			const updated = updateTransfersOnProgress(initial, {
				transferId: "tx-1",
				kind: "upload",
				bucket: "b1",
				key: "folder/file.png",
				loaded: 100,
				total: 1000,
			});
			expect(updated).toHaveLength(1);
			expect(updated[0]).toEqual({
				transferId: "tx-1",
				kind: "upload",
				bucket: "b1",
				key: "folder/file.png",
				loaded: 100,
				total: 1000,
				status: "running",
			});
		});

		it("updates progress on existing running transfer record", () => {
			const initial = [
				{
					transferId: "tx-1",
					kind: "upload",
					bucket: "b1",
					key: "folder/file.png",
					loaded: 100,
					total: 1000,
					status: "running",
				},
			];
			const updated = updateTransfersOnProgress(initial, {
				transferId: "tx-1",
				kind: "upload",
				bucket: "b1",
				key: "folder/file.png",
				loaded: 500,
				total: 1000,
			});
			expect(updated).toHaveLength(1);
			expect(updated[0]?.loaded).toBe(500);
		});

		it("does not overwrite non-running transfer record", () => {
			const initial = [
				{
					transferId: "tx-1",
					kind: "upload",
					bucket: "b1",
					key: "folder/file.png",
					loaded: 1000,
					total: 1000,
					status: "completed",
				},
			];
			const updated = updateTransfersOnProgress(initial, {
				transferId: "tx-1",
				kind: "upload",
				bucket: "b1",
				key: "folder/file.png",
				loaded: 200,
				total: 1000,
			});
			expect(updated[0]?.status).toBe("completed");
			expect(updated[0]?.loaded).toBe(1000);
		});
	});

	describe("updateTransfersOnDone", () => {
		it("marks existing record as completed and sets loaded to total", () => {
			const initial = [
				{
					transferId: "tx-1",
					kind: "upload",
					bucket: "b1",
					key: "folder/file.png",
					loaded: 800,
					total: 1000,
					status: "running",
				},
			];
			const updated = updateTransfersOnDone(
				initial,
				{ transferId: "tx-1", status: "completed" },
				{ kind: "upload", bucket: "b1", key: "folder/file.png" },
			);
			expect(updated[0]?.status).toBe("completed");
			expect(updated[0]?.loaded).toBe(1000);
		});

		it("adds record using meta when not found in previous state", () => {
			const initial: any[] = [];
			const updated = updateTransfersOnDone(
				initial,
				{
					transferId: "tx-2",
					status: "failed",
					error: { message: "Network error" },
				},
				{ kind: "download", bucket: "b1", key: "data.bin" },
			);
			expect(updated).toHaveLength(1);
			expect(updated[0]).toEqual({
				transferId: "tx-2",
				kind: "download",
				bucket: "b1",
				key: "data.bin",
				loaded: 0,
				total: 0,
				status: "failed",
				error: "Network error",
			});
		});
	});

	describe("shouldClearViewerTarget", () => {
		it("returns false for null target or null item", () => {
			expect(shouldClearViewerTarget(null, null, "c1", "b1")).toBe(false);
		});

		it("returns false for stream targets even if key matches", () => {
			const target = {
				kind: "stream",
				url: "http://127.0.0.1:8080/stream",
				contentType: "video/mp4",
				size: 100,
				fileName: "video.mp4",
				key: "video.mp4",
			};
			const item = { kind: "object", key: "video.mp4" };
			expect(shouldClearViewerTarget(target, item, "c1", "b1")).toBe(false);
		});

		it("returns false when connectionId or bucket mismatch", () => {
			const target = {
				kind: "s3",
				connectionId: "c1",
				bucket: "b1",
				key: "photo.jpg",
			};
			const item = { kind: "object", key: "photo.jpg" };
			expect(shouldClearViewerTarget(target, item, "c2", "b1")).toBe(false);
			expect(shouldClearViewerTarget(target, item, "c1", "b2")).toBe(false);
		});

		it("returns true when s3 object key matches", () => {
			const target = {
				kind: "s3",
				connectionId: "c1",
				bucket: "b1",
				key: "photo.jpg",
			};
			const item = { kind: "object", key: "photo.jpg" };
			expect(shouldClearViewerTarget(target, item, "c1", "b1")).toBe(true);
		});

		it("returns true when s3 object is under deleted folder prefix", () => {
			const target = {
				kind: "s3",
				connectionId: "c1",
				bucket: "b1",
				key: "photos/2026/vacation.jpg",
			};
			const item = { kind: "folder", prefix: "photos/" };
			expect(shouldClearViewerTarget(target, item, "c1", "b1")).toBe(true);
		});

		it("returns false when s3 object is outside deleted folder prefix", () => {
			const target = {
				kind: "s3",
				connectionId: "c1",
				bucket: "b1",
				key: "documents/notes.txt",
			};
			const item = { kind: "folder", prefix: "photos/" };
			expect(shouldClearViewerTarget(target, item, "c1", "b1")).toBe(false);
		});
	});
});
