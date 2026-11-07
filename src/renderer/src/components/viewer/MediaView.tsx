import { useCallback, useEffect, useRef, useState, type JSX, type SyntheticEvent } from "react";
import { isMkv } from "../../mediaKind";
import { AlertDescription, AlertTitle, BANNER_DESTRUCTIVE_CLASS, BANNER_SEPARATOR_CLASS } from "../ui/alert";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export interface MediaViewProps {
	url: string;
	contentType: string;
	objectKey: string;
	fileName: string;
	kind: "video" | "audio";
	onOpenWithSystemApp: () => void;
	onLoadError?: () => void;
}

export function MediaView({
	url,
	contentType,
	objectKey,
	kind,
	onOpenWithSystemApp,
	onLoadError,
}: MediaViewProps): JSX.Element {
	const [errorState, setErrorState] = useState<"none" | "unsupported" | "interrupted">("none");
	const [showMkvNotice, setShowMkvNotice] = useState<boolean>(false);
	const [retryKey, setRetryKey] = useState<number>(0);

	const videoRef = useRef<HTMLVideoElement | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const hasPlayedRef = useRef<boolean>(false);
	const lastTimeRef = useRef<number>(0);

	const getMediaElement = useCallback((): HTMLMediaElement | null => {
		return kind === "video" ? videoRef.current : audioRef.current;
	}, [kind]);

	// Unload on unmount so a closed or replaced preview never keeps playing.
	// biome-ignore lint/correctness/useExhaustiveDependencies: retryKey remounts the element, so the old one must unload
	useEffect(() => {
		const el = kind === "video" ? videoRef.current : audioRef.current;
		return () => {
			if (!el) return;
			el.pause();
			el.removeAttribute("src");
			el.load();
		};
	}, [kind, retryKey]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: url is a reset trigger
	useEffect(() => {
		setErrorState("none");
		setShowMkvNotice(false);
		hasPlayedRef.current = false;
		lastTimeRef.current = 0;
	}, [url]);

	const handleError = useCallback(
		(_e: SyntheticEvent<HTMLMediaElement>): void => {
			if (onLoadError) {
				onLoadError();
				return;
			}
			const el = getMediaElement();
			const code = el?.error?.code;
			if (code === 4) {
				setErrorState("unsupported");
			} else if (code === 2 || hasPlayedRef.current) {
				setErrorState("interrupted");
			} else {
				setErrorState("unsupported");
			}
		},
		[getMediaElement, onLoadError],
	);

	const handlePlay = useCallback((): void => {
		hasPlayedRef.current = true;
	}, []);

	const handleTimeUpdate = useCallback((): void => {
		const el = getMediaElement();
		if (!el) {
			return;
		}
		lastTimeRef.current = el.currentTime;

		if (kind === "video" && isMkv(contentType, objectKey) && !showMkvNotice && el.currentTime >= 3) {
			const extended = el as unknown as {
				mozHasAudio?: boolean;
				webkitAudioDecodedByteCount?: number;
			};
			if (extended.mozHasAudio === false || extended.webkitAudioDecodedByteCount === 0) {
				setShowMkvNotice(true);
			}
		}
	}, [kind, contentType, objectKey, showMkvNotice, getMediaElement]);

	const handleLoadedMetadata = useCallback((): void => {
		const el = getMediaElement();
		if (!el) {
			return;
		}

		if (lastTimeRef.current > 0) {
			el.currentTime = lastTimeRef.current;
			void el.play().catch(() => undefined);
		}

		if (kind === "video" && isMkv(contentType, objectKey)) {
			const extended = el as unknown as {
				audioTracks?: { length: number };
			};
			if (extended.audioTracks !== undefined && extended.audioTracks.length === 0) {
				setShowMkvNotice(true);
			}
		}
	}, [kind, contentType, objectKey, getMediaElement]);

	const handleRetry = useCallback((): void => {
		setErrorState("none");
		setRetryKey((k) => k + 1);
	}, []);

	return (
		<div className="flex h-full w-full flex-col items-center justify-center p-3">
			{showMkvNotice && (
				<div className={cn("m-2 shrink-0", BANNER_SEPARATOR_CLASS)}>
					<div className="min-w-0 flex-1">
						<AlertTitle>No audio track detected</AlertTitle>
						<AlertDescription>
							This MKV video may use an audio format unsupported by the built-in player.
						</AlertDescription>
					</div>
					<div className="flex shrink-0 items-center">
						<Button type="button" size="sm" variant="secondary" onClick={onOpenWithSystemApp}>
							Open with system app
						</Button>
					</div>
				</div>
			)}

			{errorState === "unsupported" ? (
				<div className={cn("m-2 shrink-0", BANNER_DESTRUCTIVE_CLASS)}>
					<div className="min-w-0 flex-1">
						<AlertTitle>Format not supported</AlertTitle>
						<AlertDescription>The media format cannot be played in the browser.</AlertDescription>
					</div>
					<div className="flex shrink-0 items-center">
						<Button type="button" size="sm" onClick={onOpenWithSystemApp}>
							Open with system app
						</Button>
					</div>
				</div>
			) : errorState === "interrupted" ? (
				<div className={cn("m-2 shrink-0", BANNER_SEPARATOR_CLASS)}>
					<div className="min-w-0 flex-1">
						<AlertTitle>Playback interrupted</AlertTitle>
						<AlertDescription>Stream connection interrupted during playback.</AlertDescription>
					</div>
					<div className="flex shrink-0 items-center">
						<Button type="button" size="sm" variant="secondary" onClick={handleRetry}>
							Retry
						</Button>
					</div>
				</div>
			) : kind === "video" ? (
				// biome-ignore lint/a11y/useMediaCaption: S3 objects carry no caption tracks
				<video
					key={retryKey}
					ref={videoRef}
					controls
					src={url}
					className="h-auto max-h-120 w-full max-w-full rounded-surface bg-foreground/[0.06]"
					onError={handleError}
					onPlay={handlePlay}
					onTimeUpdate={handleTimeUpdate}
					onLoadedMetadata={handleLoadedMetadata}
				/>
			) : (
				// biome-ignore lint/a11y/useMediaCaption: S3 objects carry no caption tracks
				<audio
					key={retryKey}
					ref={audioRef}
					controls
					src={url}
					className="my-auto max-h-full w-full max-w-full"
					onError={handleError}
					onPlay={handlePlay}
					onTimeUpdate={handleTimeUpdate}
					onLoadedMetadata={handleLoadedMetadata}
				/>
			)}
		</div>
	);
}
