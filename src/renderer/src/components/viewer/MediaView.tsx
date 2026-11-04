import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type JSX,
	type SyntheticEvent,
} from "react";
import { isMkv } from "../../mediaKind";

export interface MediaViewProps {
	url: string;
	contentType: string;
	objectKey: string;
	fileName: string;
	kind: "video" | "audio";
	onOpenWithSystemApp: () => void;
}

export function MediaView({
	url,
	contentType,
	objectKey,
	kind,
	onOpenWithSystemApp,
}: MediaViewProps): JSX.Element {
	const [errorState, setErrorState] = useState<
		"none" | "unsupported" | "interrupted"
	>("none");
	const [showMkvNotice, setShowMkvNotice] = useState<boolean>(false);
	const [retryKey, setRetryKey] = useState<number>(0);

	const videoRef = useRef<HTMLVideoElement | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const hasPlayedRef = useRef<boolean>(false);
	const lastTimeRef = useRef<number>(0);

	const getMediaElement = useCallback((): HTMLMediaElement | null => {
		return kind === "video" ? videoRef.current : audioRef.current;
	}, [kind]);

	useEffect(() => {
		setErrorState("none");
		setShowMkvNotice(false);
		hasPlayedRef.current = false;
		lastTimeRef.current = 0;
	}, [url]);

	const handleError = useCallback(
		(_e: SyntheticEvent<HTMLMediaElement>): void => {
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
		[getMediaElement],
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

		if (
			kind === "video" &&
			isMkv(contentType, objectKey) &&
			!showMkvNotice &&
			el.currentTime >= 3
		) {
			const extended = el as unknown as {
				mozHasAudio?: boolean;
				webkitAudioDecodedByteCount?: number;
			};
			if (
				extended.mozHasAudio === false ||
				extended.webkitAudioDecodedByteCount === 0
			) {
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
			if (
				extended.audioTracks !== undefined &&
				extended.audioTracks.length === 0
			) {
				setShowMkvNotice(true);
			}
		}
	}, [kind, contentType, objectKey, getMediaElement]);

	const handleRetry = useCallback((): void => {
		setErrorState("none");
		setRetryKey((k) => k + 1);
	}, []);

	return (
		<div className="app-media-view">
			{showMkvNotice && (
				<div className="tds-announcement tds-announcement--warning app-viewer-notice">
					<div className="tds-announcement__content">
						<div className="tds-announcement__title">
							No audio track detected
						</div>
						<div className="tds-announcement__message">
							This MKV video may use an audio format unsupported by the
							built-in player.
						</div>
					</div>
					<div className="tds-announcement__actions">
						<button
							type="button"
							className="tds-btn tds-btn--sm tds-btn--secondary"
							onClick={onOpenWithSystemApp}
						>
							Open with system app
						</button>
					</div>
				</div>
			)}

			{errorState === "unsupported" ? (
				<div className="tds-announcement tds-announcement--negative app-viewer-announcement">
					<div className="tds-announcement__content">
						<div className="tds-announcement__title">
							Format not supported
						</div>
						<div className="tds-announcement__message">
							The media format cannot be played in the browser.
						</div>
					</div>
					<div className="tds-announcement__actions">
						<button
							type="button"
							className="tds-btn tds-btn--sm tds-btn--primary"
							onClick={onOpenWithSystemApp}
						>
							Open with system app
						</button>
					</div>
				</div>
			) : errorState === "interrupted" ? (
				<div className="tds-announcement tds-announcement--warning app-viewer-announcement">
					<div className="tds-announcement__content">
						<div className="tds-announcement__title">
							Playback interrupted
						</div>
						<div className="tds-announcement__message">
							Stream connection interrupted during playback.
						</div>
					</div>
					<div className="tds-announcement__actions">
						<button
							type="button"
							className="tds-btn tds-btn--sm tds-btn--secondary"
							onClick={handleRetry}
						>
							Retry
						</button>
					</div>
				</div>
			) : kind === "video" ? (
				<video
					key={retryKey}
					ref={videoRef}
					controls
					src={url}
					className="app-media-player app-media-player--video"
					onError={handleError}
					onPlay={handlePlay}
					onTimeUpdate={handleTimeUpdate}
					onLoadedMetadata={handleLoadedMetadata}
				/>
			) : (
				<audio
					key={retryKey}
					ref={audioRef}
					controls
					src={url}
					className="app-media-player app-media-player--audio"
					onError={handleError}
					onPlay={handlePlay}
					onTimeUpdate={handleTimeUpdate}
					onLoadedMetadata={handleLoadedMetadata}
				/>
			)}
		</div>
	);
}
