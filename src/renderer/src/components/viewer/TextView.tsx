import { useEffect, useState, type JSX } from "react";
import { MAX_TEXT_PREVIEW_BYTES, readBoundedStream } from "../../textReader";

export interface TextViewProps {
	url: string;
	size: number;
	fileName: string;
}

const TWO_MB = MAX_TEXT_PREVIEW_BYTES;

export function TextView({ url, size }: TextViewProps): JSX.Element {
	const [text, setText] = useState<string | null>(null);
	const [loading, setLoading] = useState<boolean>(size > 0);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (size === 0) {
			setText("");
			setLoading(false);
			setError(null);
			return;
		}

		const controller = new AbortController();
		setLoading(true);
		setError(null);
		setText(null);

		async function loadText(): Promise<void> {
			try {
				const response = await fetch(url, {
					headers: {
						Range: "bytes=0-2097151",
					},
					signal: controller.signal,
				});

				if (!response.ok && response.status !== 206) {
					throw new Error(
						`Failed to fetch preview (${response.status})`,
					);
				}

				const bytes = await readBoundedStream(
					response.body,
					MAX_TEXT_PREVIEW_BYTES,
				);
				const decoded = new TextDecoder("utf-8", {
					fatal: false,
				}).decode(bytes);
				setText(decoded);
			} catch (err) {
				if (controller.signal.aborted) {
					return;
				}
				const message =
					err instanceof Error
						? err.message
						: "Failed to load text preview";
				setError(message);
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			}
		}

		void loadText();

		return () => {
			controller.abort();
		};
	}, [url, size]);

	if (loading) {
		return (
			<div className="app-viewer-loading">
				<div className="tds-spinner tds-spinner--md" />
				<span>Loading text preview...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="tds-announcement tds-announcement--negative app-viewer-announcement">
				<div className="tds-announcement__content">
					<div className="tds-announcement__title">
						Failed to load preview
					</div>
					<div className="tds-announcement__message">{error}</div>
				</div>
			</div>
		);
	}

	return (
		<div className="app-text-view">
			{size > TWO_MB && (
				<div className="app-text-note">Showing first 2 MB</div>
			)}
			<pre className="app-text-pre">{text ?? ""}</pre>
		</div>
	);
}
