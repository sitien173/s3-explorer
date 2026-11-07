import { useEffect, useRef, useState, type JSX } from "react";
import { AlertDescription, AlertTitle, BANNER_DESTRUCTIVE_CLASS } from "../ui/alert";
import { Spinner } from "../ui/spinner";
import { cn } from "../../lib/utils";
import { MAX_TEXT_PREVIEW_BYTES, readBoundedStream } from "../../textReader";

export interface TextViewProps {
	url: string;
	size: number;
	fileName: string;
	onLoadError?: () => void;
}

const TWO_MB = MAX_TEXT_PREVIEW_BYTES;

export function TextView({ url, size, onLoadError }: TextViewProps): JSX.Element {
	const [text, setText] = useState<string | null>(null);
	const [loading, setLoading] = useState<boolean>(size > 0);
	const [error, setError] = useState<string | null>(null);
	// Read through a ref so a new callback identity never restarts the request.
	const onLoadErrorRef = useRef(onLoadError);
	onLoadErrorRef.current = onLoadError;

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
					throw new Error(`Failed to fetch preview (${response.status})`);
				}

				const bytes = await readBoundedStream(response.body, MAX_TEXT_PREVIEW_BYTES);
				const decoded = new TextDecoder("utf-8", {
					fatal: false,
				}).decode(bytes);
				setText(decoded);
			} catch (err) {
				if (controller.signal.aborted) {
					return;
				}
				if (onLoadErrorRef.current) {
					onLoadErrorRef.current();
					return;
				}
				const message = err instanceof Error ? err.message : "Failed to load text preview";
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
			<div className="flex h-full min-h-50 flex-col items-center justify-center gap-3 text-sm text-foreground-secondary">
				<Spinner className="size-9" />
				<span>Loading text preview...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className={cn("m-2 shrink-0", BANNER_DESTRUCTIVE_CLASS)}>
				<div className="min-w-0 flex-1">
					<AlertTitle>Failed to load preview</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-background">
			{size > TWO_MB && (
				<div className="shrink-0 border-b border-separator bg-foreground/[0.06] px-3 py-1 text-sm text-foreground-secondary">
					Showing first 2 MB
				</div>
			)}
			<pre className="m-0 flex-1 overflow-auto whitespace-pre-wrap break-all bg-background p-3 font-mono text-sm leading-[1.125rem] text-foreground">
				{text ?? ""}
			</pre>
		</div>
	);
}
