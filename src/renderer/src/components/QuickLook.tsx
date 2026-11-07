import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog as Primitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent, type ReactNode } from "react";
import { api, unwrap } from "../api";
import { formatBytes, type BrowserRow } from "../format";
import { mediaKind } from "../mediaKind";
import { queryKeys, streamOpenQuery } from "../queries";
import type { ViewerTarget, ViewerTargetS3 } from "../store";
import { ImageView } from "./viewer/ImageView";
import { MediaView } from "./viewer/MediaView";
import { PdfView } from "./viewer/PdfView";
import { TextView } from "./viewer/TextView";
import { useFinalFocus } from "./ui/dialog";
import { AlertDescription, AlertTitle, BANNER_DESTRUCTIVE_CLASS } from "./ui/alert";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { cn } from "../lib/utils";

type ObjectRow = Extract<BrowserRow, { kind: "object" }>;

export interface QuickLookProps {
	target: ViewerTarget | null;
	/** The listing rows in display order, read when an arrow key is pressed. */
	getSiblings: () => BrowserRow[];
	onNavigate: (row: ObjectRow) => void;
	onClose: () => void;
}

const NAVIGATION_DEBOUNCE_MS = 120;
const ARROW_DELTA: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
const TYPING_TARGET = /^(INPUT|TEXTAREA|SELECT)$/;
const MEDIA_TARGET = /^(VIDEO|AUDIO)$/;

const targetKey = (target: ViewerTarget): string =>
	target.kind === "s3" ? target.key : (target.key ?? target.fileName);
const targetFileName = (target: ViewerTarget): string => {
	const key = targetKey(target);
	return target.fileName ?? (key.split("/").filter(Boolean).pop() || key);
};
const targetId = (target: ViewerTarget | null): string | null =>
	target?.kind === "s3" ? `${target.connectionId}\0${target.bucket}\0${target.key}` : null;

/** Follows an s3 target immediately on open and after a pause while arrow keys change it. */
function useSettledTarget(target: ViewerTargetS3 | null): ViewerTargetS3 | null {
	const [settled, setSettled] = useState<ViewerTargetS3 | null>(target);
	const id = targetId(target);
	// The first target after opening has nothing to debounce against.
	if (target && settled === null) setSettled(target);
	// biome-ignore lint/correctness/useExhaustiveDependencies: id identifies the target; the object may be recreated each render
	useEffect(() => {
		if (!target) {
			setSettled(null);
			return;
		}
		const timer = setTimeout(() => setSettled(target), NAVIGATION_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [id]);
	return target && (settled ?? target);
}

function ErrorAlert({
	title,
	actions,
	children,
}: {
	title: string;
	actions?: ReactNode;
	children: ReactNode;
}): JSX.Element {
	return (
		<div className={cn("m-2 shrink-0", BANNER_DESTRUCTIVE_CLASS)}>
			<div className="min-w-0 flex-1">
				<AlertTitle>{title}</AlertTitle>
				<AlertDescription>{children}</AlertDescription>
			</div>
			{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
		</div>
	);
}

export function QuickLook({ target, getSiblings, onNavigate, onClose }: QuickLookProps): JSX.Element {
	const queryClient = useQueryClient();
	const open = target !== null;
	// Keep the last target mounted while the popup plays its exit transition.
	const [shown, setShown] = useState(target);
	if (target && target !== shown) setShown(target);
	const current = target ?? shown;
	const shownRef = useRef(current);
	shownRef.current = current;

	const popupRef = useRef<HTMLDivElement>(null);
	const openerFocus = useFinalFocus(open);
	const finalFocus = () => {
		const last = shownRef.current;
		const row = last ? document.getElementById(`object-row-${encodeURIComponent(targetKey(last))}`) : null;
		return row?.isConnected ? row : openerFocus();
	};

	const [openingSystemApp, setOpeningSystemApp] = useState(false);
	const [systemAppError, setSystemAppError] = useState<string | null>(null);
	const [failedId, setFailedId] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);
	const retried = useRef(new Set<string>());

	const s3Target = current?.kind === "s3" ? current : null;
	const requested = useSettledTarget(open && target?.kind === "s3" ? target : null);
	const settled = open ? requested : s3Target;
	const stream = useQuery({
		...streamOpenQuery({
			connectionId: settled?.connectionId ?? "",
			bucket: settled?.bucket ?? "",
			key: settled?.key ?? "",
		}),
		enabled: settled !== null,
	});
	const waiting = s3Target !== null && targetId(settled) !== targetId(s3Target);
	const streamData = useMemo(
		() =>
			current?.kind === "stream"
				? { url: current.url, contentType: current.contentType, size: current.size }
				: waiting
					? null
					: (stream.data ?? null),
		[current, waiting, stream.data],
	);
	const loading = s3Target !== null && (waiting || stream.isLoading);
	const loadError =
		s3Target !== null && !waiting && stream.isError ? stream.error.message || "Failed to open stream" : null;

	const currentId = current ? (targetId(current) ?? `stream\0${targetKey(current)}`) : null;
	// A target shown again starts with a fresh retry budget and no stale error.
	const [seenId, setSeenId] = useState(currentId);
	if (seenId !== currentId) {
		setSeenId(currentId);
		setFailedId(null);
		retried.current.clear();
	}
	const loadFailed = currentId !== null && failedId === currentId;

	useEffect(() => {
		if (open) return;
		retried.current.clear();
		setFailedId(null);
		setSystemAppError(null);
	}, [open]);

	function dropStreamAndReload(): void {
		if (!s3Target) return;
		queryClient.removeQueries({ queryKey: queryKeys.stream(s3Target.connectionId, s3Target.bucket, s3Target.key) });
		void stream.refetch();
	}

	// The renderer cannot read an HTTP status from <img> or <video>, so the first load error is treated as an expired handle.
	function handleLoadError(): void {
		if (!currentId) return;
		if (s3Target && !retried.current.has(currentId)) {
			retried.current.add(currentId);
			dropStreamAndReload();
			return;
		}
		setFailedId(currentId);
	}

	function handleRetry(): void {
		if (!currentId) return;
		retried.current.delete(currentId);
		setFailedId(null);
		if (s3Target) dropStreamAndReload();
		else setAttempt((n) => n + 1);
	}

	async function handleOpenWithSystemApp(): Promise<void> {
		if (!streamData || !current) return;
		setOpeningSystemApp(true);
		setSystemAppError(null);
		try {
			unwrap(await api.files.openWithSystemApp({ url: streamData.url, fileName: targetFileName(current) }));
		} catch (err: unknown) {
			setSystemAppError(err instanceof Error ? err.message : "Failed to open with system app");
		} finally {
			setOpeningSystemApp(false);
		}
	}

	function navigate(delta: number): void {
		if (target?.kind !== "s3") return;
		const objects = getSiblings().filter((row): row is ObjectRow => row.kind === "object");
		const index = objects.findIndex((row) => row.key === target.key);
		const next = index < 0 ? undefined : objects[index + delta];
		if (next) onNavigate(next);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
		const element = event.target as HTMLElement;
		const typing = TYPING_TARGET.test(element.tagName) || element.isContentEditable;
		if (event.key === " ") {
			if (typing || element.tagName === "BUTTON") return;
			event.preventDefault();
			onClose();
		} else if (event.key in ARROW_DELTA && !typing && !MEDIA_TARGET.test(element.tagName)) {
			event.preventDefault();
			navigate(ARROW_DELTA[event.key]);
		}
	}

	const fileName = current ? targetFileName(current) : "";
	const key = current ? targetKey(current) : "";
	const kind = streamData ? mediaKind(streamData.contentType, key) : "unsupported";
	const viewKey = `${streamData?.url}:${attempt}`;
	const retryButton = (
		<Button type="button" size="sm" variant="secondary" onClick={handleRetry}>
			Retry
		</Button>
	);

	return (
		<Primitive.Root
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<Primitive.Portal>
				<div className="fixed inset-0 z-[1000] flex items-center justify-center p-8">
					<Primitive.Backdrop className="absolute inset-0 bg-scrim transition-opacity duration-200 ease-out motion-reduce:transition-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
					<Primitive.Popup
						ref={popupRef}
						tabIndex={-1}
						className="relative flex h-full max-h-[48rem] w-full max-w-5xl flex-col overflow-hidden rounded-overlay border border-separator bg-elevated text-foreground shadow-overlay outline-none transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
						aria-describedby={undefined}
						initialFocus={popupRef}
						finalFocus={finalFocus}
						onKeyDown={handleKeyDown}
					>
						<header className="flex h-10 shrink-0 items-center gap-2 border-b border-separator px-3">
							<Primitive.Close
								render={<Button variant="ghost" size="icon" aria-label="Close Quick Look" className="shrink-0" />}
							>
								<X aria-hidden="true" className="size-4" />
							</Primitive.Close>
							<Primitive.Title
								className="m-0 min-w-0 flex-1 truncate text-center text-sm font-semibold text-foreground"
								title={fileName}
							>
								{fileName}
							</Primitive.Title>
							<span className="w-16 shrink-0 text-right text-xs tabular-nums text-foreground-secondary">
								{streamData ? formatBytes(streamData.size) : ""}
							</span>
						</header>

						{systemAppError && <ErrorAlert title="Unable to open with system app">{systemAppError}</ErrorAlert>}

						<div className="relative flex min-h-0 flex-1 flex-col overflow-auto bg-surface">
							{loading ? (
								<div
									className="flex h-full min-h-50 flex-col items-center justify-center gap-3 text-sm text-foreground-secondary"
									role="status"
								>
									<Spinner className="size-9" />
									<span>Loading preview...</span>
								</div>
							) : loadError ? (
								<ErrorAlert title="Failed to open object" actions={retryButton}>
									{loadError}
								</ErrorAlert>
							) : loadFailed ? (
								<ErrorAlert
									title="Preview failed to load"
									actions={
										<>
											{retryButton}
											<Button
												type="button"
												size="sm"
												onClick={() => void handleOpenWithSystemApp()}
												disabled={openingSystemApp}
											>
												Open with system app
											</Button>
										</>
									}
								>
									The object could not be loaded or its format is not supported.
								</ErrorAlert>
							) : streamData ? (
								kind === "video" || kind === "audio" ? (
									// Unmounted on close so playback stops before the exit transition ends.
									open && (
										<MediaView
											key={viewKey}
											url={streamData.url}
											contentType={streamData.contentType}
											objectKey={key}
											fileName={fileName}
											kind={kind}
											onOpenWithSystemApp={() => void handleOpenWithSystemApp()}
											onLoadError={handleLoadError}
										/>
									)
								) : kind === "image" ? (
									<ImageView
										key={viewKey}
										url={streamData.url}
										fileName={fileName}
										onOpenWithSystemApp={() => void handleOpenWithSystemApp()}
										onLoadError={handleLoadError}
									/>
								) : kind === "pdf" ? (
									<PdfView
										key={viewKey}
										url={streamData.url}
										contentType={streamData.contentType}
										fileName={fileName}
										onOpenWithSystemApp={() => void handleOpenWithSystemApp()}
									/>
								) : kind === "text" ? (
									<TextView
										key={viewKey}
										url={streamData.url}
										size={streamData.size}
										fileName={fileName}
										onLoadError={handleLoadError}
									/>
								) : (
									<div className="m-auto flex flex-col items-center justify-center gap-3 p-6 text-center">
										<div className="flex flex-col items-center gap-1">
											<div className="break-all text-base font-semibold text-foreground">{fileName}</div>
											<div className="text-sm text-foreground-secondary">{formatBytes(streamData.size)}</div>
											<div className="text-sm text-foreground-secondary">
												Preview is not available for this file type.
											</div>
										</div>
										<Button
											type="button"
											variant="default"
											onClick={() => void handleOpenWithSystemApp()}
											disabled={openingSystemApp}
										>
											{openingSystemApp ? "Opening..." : "Open with system app"}
										</Button>
									</div>
								)
							) : null}
						</div>
					</Primitive.Popup>
				</div>
			</Primitive.Portal>
		</Primitive.Root>
	);
}
