import { useState, type JSX } from "react";
import { AlertDescription, AlertTitle, BANNER_DESTRUCTIVE_CLASS } from "../ui/alert";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export interface ImageViewProps {
	url: string;
	fileName: string;
	onOpenWithSystemApp: () => void;
	onLoadError?: () => void;
}

export function ImageView({ url, fileName, onOpenWithSystemApp, onLoadError }: ImageViewProps): JSX.Element {
	const [hasError, setHasError] = useState<boolean>(false);

	if (hasError) {
		return (
			<div className={cn("m-2 shrink-0", BANNER_DESTRUCTIVE_CLASS)}>
				<div className="min-w-0 flex-1">
					<AlertTitle>Format not supported</AlertTitle>
					<AlertDescription>This image format cannot be displayed in the browser.</AlertDescription>
				</div>
				<div className="flex shrink-0 items-center">
					<Button type="button" size="sm" onClick={onOpenWithSystemApp}>
						Open with system app
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full items-center justify-center overflow-auto p-3">
			<img
				src={url}
				alt={fileName}
				className="max-h-full max-w-full rounded-surface object-contain"
				onError={() => {
					if (onLoadError) onLoadError();
					else setHasError(true);
				}}
			/>
		</div>
	);
}
