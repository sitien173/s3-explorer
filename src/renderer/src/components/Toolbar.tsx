import { type JSX } from "react";
import type { BrowserRow } from "../format";
import { Button } from "./ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";

export interface ToolbarProps {
	connectionId: string;
	bucket: string;
	prefix: string;
	selectedItem: BrowserRow | null;
	selectedCount?: number;
	hasFolderSelected?: boolean;
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
	selectedCount = selectedItem ? 1 : 0,
	hasFolderSelected = false,
	onUpload,
	onNewFolder,
	onDownload,
	onRename,
	onDelete,
	onOpenUrl,
	onRefresh,
}: ToolbarProps): JSX.Element {
	const isObjectSelected = selectedItem?.kind === "object" && selectedCount === 1;
	const isSingleSelected = selectedCount === 1;
	const isMultiDeleteDisabled = selectedCount > 1 && hasFolderSelected;
	const canDelete = selectedCount === 1 || (selectedCount > 1 && !hasFolderSelected);
	const deleteTooltip = isMultiDeleteDisabled ? "Folders cannot be multi-deleted" : "Delete";

	const actions: ReadonlyArray<readonly [string, () => void, boolean, string]> = [
		["Upload", onUpload, false, "Upload"],
		["New folder", onNewFolder, false, "New folder"],
		["Download", onDownload, !isObjectSelected, "Download"],
		["Rename or move", onRename, !isSingleSelected, "Rename or move"],
		["Delete", onDelete, !canDelete, deleteTooltip],
		["Open URL", onOpenUrl, false, "Open URL"],
		["Refresh", onRefresh, false, "Refresh"],
	];

	return (
		<TooltipProvider>
			<div className="app-toolbar" role="toolbar" aria-label="Bucket operations">
				<div className="app-toolbar-group">
					{actions.map(([label, action, disabled, tooltip]) => (
						<Tooltip key={label}>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={action}
									disabled={disabled}
								>
									{label}
								</Button>
							</TooltipTrigger>
							<TooltipContent>{tooltip}</TooltipContent>
						</Tooltip>
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}
