import { useCallback, useEffect, useRef, useState } from "react";
import { mediaKind } from "./mediaKind";
import type { BrowserRow } from "./format";
import type { ViewerTarget } from "./store";

export const MAX_THUMBNAIL_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const THUMBNAIL_CONCURRENCY = 4;
export const SCROLL_IDLE_DELAY_MS = 150;

export function isEligibleThumbnail(row: BrowserRow): row is BrowserRow & { kind: "object" } {
	if (row.kind !== "object") return false;
	if (row.size === undefined || typeof row.size !== "number" || row.size > MAX_THUMBNAIL_SIZE_BYTES) return false;
	return mediaKind("", row.key) === "image";
}

export function isQuickLookPlayingMedia(viewerTarget: ViewerTarget | null): boolean {
	if (!viewerTarget) return false;
	const key = viewerTarget.kind === "s3" ? viewerTarget.key : viewerTarget.fileName || "";
	const contentType = viewerTarget.kind === "stream" ? viewerTarget.contentType : "";
	const kind = mediaKind(contentType, key);
	return kind === "video" || kind === "audio";
}

export type ThumbnailStatus = "idle" | "loading" | "loaded" | "error";

export interface ThumbnailItemState {
	status: ThumbnailStatus;
	url?: string;
}

export interface ThumbnailSchedulerOptions {
	connectionId: string;
	bucket: string;
	openStream: (target: { connectionId: string; bucket: string; key: string }) => Promise<{ url: string }>;
	loadImage?: (url: string, signal?: AbortSignal) => Promise<void>;
	onStateChange?: (state: Record<string, ThumbnailItemState>) => void;
	idleDelayMs?: number;
	maxConcurrency?: number;
}

export function defaultLoadImage(url: string, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Aborted"));
			return;
		}
		const img = new Image();
		const cleanup = () => {
			img.onload = null;
			img.onerror = null;
			signal?.removeEventListener("abort", onAbort);
		};
		const onAbort = () => {
			cleanup();
			img.src = "";
			reject(new Error("Aborted"));
		};
		signal?.addEventListener("abort", onAbort);
		img.onload = () => {
			cleanup();
			resolve();
		};
		img.onerror = () => {
			cleanup();
			reject(new Error("Image load error"));
		};
		img.src = url;
	});
}

export class ThumbnailScheduler {
	private readonly options: ThumbnailSchedulerOptions;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private visibleRows: BrowserRow[] = [];
	private paused = false;
	private queue: string[] = [];
	private currentInFlight = new Set<string>();
	private state: Record<string, ThumbnailItemState> = {};
	private generation = 0;
	private pendingCount = 0;
	private controllers = new Map<string, AbortController>();
	private destroyed = false;

	constructor(options: ThumbnailSchedulerOptions) {
		this.options = options;
	}

	getState(): Record<string, ThumbnailItemState> {
		return this.state;
	}

	schedule(visibleRows: BrowserRow[]): void {
		if (this.destroyed) return;
		const sameKeys =
			this.visibleRows.length === visibleRows.length &&
			this.visibleRows.every((r, i) => {
				const k1 = r.kind === "folder" ? r.prefix : r.key;
				const k2 = visibleRows[i].kind === "folder" ? visibleRows[i].prefix : visibleRows[i].key;
				return k1 === k2;
			});

		this.visibleRows = visibleRows;
		if (sameKeys) {
			return;
		}
		this.resetIdleTimer();
	}

	onScroll(): void {
		if (this.destroyed) return;
		this.resetIdleTimer();
	}

	setPaused(paused: boolean): void {
		if (this.destroyed) return;
		this.paused = paused;
		if (!paused) {
			this.pump();
		}
	}

	cancelAll(): void {
		if (this.idleTimer !== null) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		this.generation++;
		this.queue = [];
		this.currentInFlight.clear();
		this.state = {};
		for (const controller of this.controllers.values()) {
			controller.abort();
		}
		this.controllers.clear();
	}

	markError(key: string): void {
		if (this.destroyed) return;
		this.state = { ...this.state, [key]: { status: "error" } };
		this.options.onStateChange?.(this.state);
	}

	destroy(): void {
		this.destroyed = true;
		this.cancelAll();
	}

	private resetIdleTimer(): void {
		if (this.idleTimer !== null) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		const delay = this.options.idleDelayMs ?? SCROLL_IDLE_DELAY_MS;
		this.idleTimer = setTimeout(() => {
			this.idleTimer = null;
			this.onIdle();
		}, delay);
	}

	private onIdle(): void {
		if (this.destroyed) return;

		const eligibleKeys: string[] = [];
		for (const row of this.visibleRows) {
			if (!isEligibleThumbnail(row)) continue;
			const key = row.key;
			const s = this.state[key]?.status;
			if (s === "loaded" || s === "error") continue;
			eligibleKeys.push(key);
		}

		this.queue = eligibleKeys.filter((k) => !this.currentInFlight.has(k));
		this.pump();
	}

	private pump(): void {
		if (this.destroyed || this.paused) return;
		const maxConcurrency = this.options.maxConcurrency ?? THUMBNAIL_CONCURRENCY;

		while (this.pendingCount < maxConcurrency && this.queue.length > 0) {
			const key = this.queue.shift()!;
			if (this.currentInFlight.has(key)) continue;
			const s = this.state[key]?.status;
			if (s === "loaded" || s === "error") continue;
			void this.startRequest(key, this.generation);
		}
	}

	private async startRequest(key: string, gen: number): Promise<void> {
		this.pendingCount++;
		this.currentInFlight.add(key);
		const controller = new AbortController();
		this.controllers.set(key, controller);
		this.state = {
			...this.state,
			[key]: { status: "loading" },
		};
		this.options.onStateChange?.(this.state);

		try {
			const openRes = await this.options.openStream({
				connectionId: this.options.connectionId,
				bucket: this.options.bucket,
				key,
			});

			if (gen !== this.generation || this.destroyed || controller.signal.aborted) {
				return;
			}

			if (this.options.loadImage) {
				await this.options.loadImage(openRes.url);
			} else {
				await defaultLoadImage(openRes.url, controller.signal);
			}

			if (gen !== this.generation || this.destroyed || controller.signal.aborted) {
				return;
			}

			this.state = {
				...this.state,
				[key]: { status: "loaded", url: openRes.url },
			};
		} catch {
			if (gen !== this.generation || this.destroyed || controller.signal.aborted) {
				return;
			}
			this.state = {
				...this.state,
				[key]: { status: "error" },
			};
		} finally {
			this.pendingCount--;
			if (this.controllers.get(key) === controller) this.controllers.delete(key);
			if (gen === this.generation) {
				this.currentInFlight.delete(key);
				if (!this.destroyed) {
					this.options.onStateChange?.(this.state);
				}
			}
			if (!this.destroyed && !this.paused) {
				this.pump();
			}
		}
	}
}

export interface UseThumbnailSchedulerProps {
	connectionId: string;
	bucket: string;
	prefix: string;
	visibleRows: BrowserRow[];
	viewerTarget?: ViewerTarget | null;
	openStream: (target: { connectionId: string; bucket: string; key: string }) => Promise<{ url: string }>;
	loadImage?: (url: string, signal?: AbortSignal) => Promise<void>;
}

export function useThumbnailScheduler({
	connectionId,
	bucket,
	prefix,
	visibleRows,
	viewerTarget,
	openStream,
	loadImage,
}: UseThumbnailSchedulerProps): {
	thumbnails: Record<string, ThumbnailItemState>;
	onScroll: () => void;
	markThumbnailError: (key: string) => void;
} {
	const [thumbnails, setThumbnails] = useState<Record<string, ThumbnailItemState>>({});
	const schedulerRef = useRef<ThumbnailScheduler | null>(null);

	useEffect(() => {
		setThumbnails({});
		const scheduler = new ThumbnailScheduler({
			connectionId,
			bucket,
			openStream,
			loadImage,
			onStateChange: (nextState) => {
				setThumbnails({ ...nextState });
			},
		});

		schedulerRef.current = scheduler;

		return () => {
			scheduler.destroy();
			schedulerRef.current = null;
		};
	}, [connectionId, bucket, openStream, loadImage]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: effect resets thumbnails and cancels pending work when prefix changes
	useEffect(() => {
		const scheduler = schedulerRef.current;
		if (scheduler) {
			scheduler.cancelAll();
		}
		setThumbnails({});
	}, [prefix]);

	useEffect(() => {
		const scheduler = schedulerRef.current;
		if (!scheduler) return;
		const isPlaying = isQuickLookPlayingMedia(viewerTarget ?? null);
		scheduler.setPaused(isPlaying);
	}, [viewerTarget]);

	useEffect(() => {
		const scheduler = schedulerRef.current;
		if (!scheduler) return;
		scheduler.schedule(visibleRows);
	}, [visibleRows]);

	const onScroll = useCallback(() => {
		schedulerRef.current?.onScroll();
	}, []);

	const markThumbnailError = useCallback((key: string) => {
		schedulerRef.current?.markError(key);
	}, []);

	return { thumbnails, onScroll, markThumbnailError };
}
