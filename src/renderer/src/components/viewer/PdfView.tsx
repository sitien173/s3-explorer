import { type JSX } from "react";
import { isPdfContentType } from "../../mediaKind";

export interface PdfViewProps {
	url: string;
	contentType: string;
	fileName: string;
	onOpenWithSystemApp: () => void;
}

export function PdfView({
	url,
	contentType,
	fileName,
	onOpenWithSystemApp,
}: PdfViewProps): JSX.Element {
	if (!isPdfContentType(contentType)) {
		return (
			<div className="tds-announcement tds-announcement--negative app-viewer-announcement">
				<div className="tds-announcement__content">
					<div className="tds-announcement__title">
						Format not supported
					</div>
					<div className="tds-announcement__message">
						PDF preview requires an application/pdf content type.
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
		);
	}

	return (
		<div className="app-pdf-view">
			<iframe
				title={fileName}
				src={url}
				className="app-pdf-frame"
			/>
		</div>
	);
}
