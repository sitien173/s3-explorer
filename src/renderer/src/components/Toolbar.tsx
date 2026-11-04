import { type JSX } from "react";
import type { BrowserRow } from "../format";

export interface ToolbarProps {
	connectionId: string;
	bucket: string;
	prefix: string;
	selectedItem: BrowserRow | null;
	onUpload: () => void;
	onNewFolder: () => void;
	onDownload: () => void;
	onRename: () => void;
	onDelete: () => void;
	onOpenUrl: () => void;
	onRefresh: () => void;
}

export function Toolbar({
	selectedItem,
	onUpload,
	onNewFolder,
	onDownload,
	onRename,
	onDelete,
	onOpenUrl,
	onRefresh,
}: ToolbarProps): JSX.Element {
	const isObjectSelected = selectedItem?.kind === "object";
	const isItemSelected = selectedItem !== null;

	return (
		<div className="app-toolbar" role="toolbar" aria-label="Bucket operations">
			<div className="app-toolbar-group">
				<button
					type="button"
					className="tds-btn tds-btn--sm tds-btn--secondary"
					onClick={onUpload}
				>
					Upload
				</button>
				<button
					type="button"
					className="tds-btn tds-btn--sm tds-btn--secondary"
					onClick={onNewFolder}
				>
					New folder
				</button>
				<button
					type="button"
					className="tds-btn tds-btn--sm tds-btn--secondary"
					onClick={onDownload}
					disabled={!isObjectSelected}
				>
					Download
				</button>
				<button
					type="button"
					className="tds-btn tds-btn--sm tds-btn--secondary"
					onClick={onRename}
					disabled={!isItemSelected}
				>
					Rename or move
				</button>
				<button
					type="button"
					className="tds-btn tds-btn--sm tds-btn--secondary"
					onClick={onDelete}
					disabled={!isItemSelected}
				>
					Delete
				</button>
			</div>

			<div className="app-toolbar-group">
				<button
					type="button"
					className="tds-btn tds-btn--sm tds-btn--secondary"
					onClick={onOpenUrl}
				>
					Open URL
				</button>
				<button
					type="button"
					className="tds-btn tds-btn--sm tds-btn--secondary"
					onClick={onRefresh}
				>
					Refresh
				</button>
			</div>
		</div>
	);
}
