import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type JSX,
} from "react";
import { api, unwrap } from "../api";
import { formatBytes } from "../format";
import { mediaKind } from "../mediaKind";
import { ImageView } from "./viewer/ImageView";
import { MediaView } from "./viewer/MediaView";
import { PdfView } from "./viewer/PdfView";
import { TextView } from "./viewer/TextView";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export interface ViewerTargetS3 {
	kind: "s3";
	connectionId: string;
	bucket: string;
	key: string;
	size?: number;
	fileName?: string;
}

export interface ViewerTargetStream {
	kind: "stream";
	url: string;
	contentType: string;
	size: number;
	fileName: string;
	key?: string;
}

export type ViewerTarget = ViewerTargetS3 | ViewerTargetStream;

export interface ViewerProps {
	target: ViewerTarget;
	onClose: () => void;
}

interface StreamData {
	url: string;
	contentType: string;
	size: number;
}

export function Viewer({ target, onClose }: ViewerProps): JSX.Element {
	const [streamData, setStreamData] = useState<StreamData | null>(
		target.kind === "stream"
			? {
					url: target.url,
					contentType: target.contentType,
					size: target.size,
				}
			: null,
	);
	const [loading, setLoading] = useState<boolean>(target.kind === "s3");
	const [loadError, setLoadError] = useState<string | null>(null);
	const [openingSystemApp, setOpeningSystemApp] = useState<boolean>(false);
	const [systemAppError, setSystemAppError] = useState<string | null>(null);

	const loadIdRef = useRef<number>(0);

	const targetKey =
		target.kind === "s3"
			? target.key
			: target.key ?? target.fileName;

	const fileName =
		target.fileName ??
		(targetKey.split("/").filter(Boolean).pop() || targetKey);

	useEffect(() => {
		loadIdRef.current += 1;
		const thisLoadId = loadIdRef.current;
		setSystemAppError(null);

		if (target.kind === "stream") {
			setStreamData({
				url: target.url,
				contentType: target.contentType,
				size: target.size,
			});
			setLoading(false);
			setLoadError(null);
			return () => {
				loadIdRef.current += 1;
			};
		}

		setLoading(true);
		setLoadError(null);
		setStreamData(null);

		void api.stream
			.open({
				connectionId: target.connectionId,
				bucket: target.bucket,
				key: target.key,
			})
			.then((res) => {
				if (thisLoadId !== loadIdRef.current) {
					return;
				}
				const data = unwrap(res);
				setStreamData(data);
				setLoading(false);
			})
			.catch((err: unknown) => {
				if (thisLoadId !== loadIdRef.current) {
					return;
				}
				setLoading(false);
				const message =
					err instanceof Error
						? err.message
						: "Failed to open stream";
				setLoadError(message);
			});

		return () => {
			loadIdRef.current += 1;
		};
	}, [target]);

	const handleOpenWithSystemApp = useCallback(async (): Promise<void> => {
		if (!streamData) {
			return;
		}
		setOpeningSystemApp(true);
		setSystemAppError(null);
		try {
			const res = await api.files.openWithSystemApp({
				url: streamData.url,
				fileName,
			});
			unwrap(res);
		} catch (err: unknown) {
			const message =
				err instanceof Error
					? err.message
					: "Failed to open with system app";
			setSystemAppError(message);
		} finally {
			setOpeningSystemApp(false);
		}
	}, [streamData, fileName]);

	const kind = streamData
		? mediaKind(streamData.contentType, targetKey)
		: "unsupported";

	return (
		<aside className="app-viewer" aria-label="Object preview" role="region">
			<header className="app-viewer-header">
				<div className="app-viewer-meta">
					<span className="app-viewer-filename" title={fileName}>
						{fileName}
					</span>
					{streamData && (
						<span className="app-viewer-size">
							{formatBytes(streamData.size)}
						</span>
					)}
				</div>
				<TooltipProvider>
					<Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Close preview" onClick={onClose}>×</Button></TooltipTrigger><TooltipContent>Close preview</TooltipContent></Tooltip>
				</TooltipProvider>
			</header>

			{systemAppError && (
				<div className="tds-announcement tds-announcement--negative app-viewer-announcement">
					<div className="tds-announcement__content">
						<div className="tds-announcement__title">
							Unable to open with system app
						</div>
						<div className="tds-announcement__message">
							{systemAppError}
						</div>
					</div>
				</div>
			)}

			<div className="app-viewer-content">
				{loading ? (
					<div className="app-viewer-loading">
						<div className="tds-spinner tds-spinner--md" />
						<span>Loading preview...</span>
					</div>
				) : loadError ? (
					<div className="tds-announcement tds-announcement--negative app-viewer-announcement">
						<div className="tds-announcement__content">
							<div className="tds-announcement__title">
								Failed to open object
							</div>
							<div className="tds-announcement__message">
								{loadError}
							</div>
						</div>
					</div>
				) : streamData ? (
					kind === "video" || kind === "audio" ? (
						<MediaView
							url={streamData.url}
							contentType={streamData.contentType}
							objectKey={targetKey}
							fileName={fileName}
							kind={kind}
							onOpenWithSystemApp={handleOpenWithSystemApp}
						/>
					) : kind === "image" ? (
						<ImageView
							url={streamData.url}
							fileName={fileName}
							onOpenWithSystemApp={handleOpenWithSystemApp}
						/>
					) : kind === "pdf" ? (
						<PdfView
							url={streamData.url}
							contentType={streamData.contentType}
							fileName={fileName}
							onOpenWithSystemApp={handleOpenWithSystemApp}
						/>
					) : kind === "text" ? (
						<TextView
							url={streamData.url}
							size={streamData.size}
							fileName={fileName}
						/>
					) : (
						<div className="app-viewer-unsupported">
							<div
								className="app-viewer-unsupported-icon"
								aria-hidden="true"
							>
								<svg
									width="40"
									height="40"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
									<polyline points="14 2 14 8 20 8" />
								</svg>
							</div>
							<div className="app-viewer-unsupported-details">
								<div className="app-viewer-unsupported-name">
									{fileName}
								</div>
								<div className="app-viewer-unsupported-size">
									{formatBytes(streamData.size)}
								</div>
								<div className="app-viewer-unsupported-caption">
									Preview is not available for this file type.
								</div>
							</div>
							<button
								type="button"
								className="tds-btn tds-btn--md tds-btn--primary"
								onClick={handleOpenWithSystemApp}
								disabled={openingSystemApp}
							>
								{openingSystemApp
									? "Opening..."
									: "Open with system app"}
							</button>
						</div>
					)
				) : null}
			</div>
		</aside>
	);
}
