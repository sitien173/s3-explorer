import type { JSX } from "react";
import { AlertDescription, AlertTitle, BANNER_DESTRUCTIVE_CLASS } from "../ui/alert";
import { Button } from "../ui/button";
import { isPdfContentType } from "../../mediaKind";
import { cn } from "../../lib/utils";

export interface PdfViewProps {
	url: string;
	contentType: string;
	fileName: string;
	onOpenWithSystemApp: () => void;
}

export function PdfView({ url, contentType, fileName, onOpenWithSystemApp }: PdfViewProps): JSX.Element {
	if (!isPdfContentType(contentType)) {
		return (
			<div className={cn("m-2 shrink-0", BANNER_DESTRUCTIVE_CLASS)}>
				<div className="min-w-0 flex-1">
					<AlertTitle>Format not supported</AlertTitle>
					<AlertDescription>PDF preview requires an application/pdf content type.</AlertDescription>
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
		<div className="flex h-full w-full flex-col">
			<iframe title={fileName} src={url} className="h-full w-full flex-1 border-none" />
		</div>
	);
}
