import { useEffect, useState, type JSX } from "react";

export interface ImageViewProps {
	url: string;
	fileName: string;
	onOpenWithSystemApp: () => void;
}

export function ImageView({
	url,
	fileName,
	onOpenWithSystemApp,
}: ImageViewProps): JSX.Element {
	const [hasError, setHasError] = useState<boolean>(false);

	useEffect(() => {
		setHasError(false);
	}, [url]);

	if (hasError) {
		return (
			<div className="tds-announcement tds-announcement--negative app-viewer-announcement">
				<div className="tds-announcement__content">
					<div className="tds-announcement__title">
						Format not supported
					</div>
					<div className="tds-announcement__message">
						This image format cannot be displayed in the browser.
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
		<div className="app-image-view-container">
			<img
				src={url}
				alt={fileName}
				className="app-image-view"
				onError={() => {
					setHasError(true);
				}}
			/>
		</div>
	);
}
