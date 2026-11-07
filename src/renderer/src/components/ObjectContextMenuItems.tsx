import type { JSX } from "react";
import type { BrowserRow } from "../format";
import { ContextMenuItem } from "./ui/context-menu";

export interface ObjectContextMenuItemsProps {
	selectedKeys: string[];
	hasFolderSelected: boolean;
	contextRow: BrowserRow | null;
	onGridAction?: (action: string, row: BrowserRow | null) => void;
	onOpenRow?: (row: BrowserRow) => void;
	onNavigate: (newPrefix: string) => void;
}

export function ObjectContextMenuItems({
	selectedKeys,
	hasFolderSelected,
	contextRow,
	onGridAction,
	onOpenRow,
	onNavigate,
}: ObjectContextMenuItemsProps): JSX.Element | null {
	if (selectedKeys.length > 1) {
		return hasFolderSelected ? (
			<ContextMenuItem disabled>Delete (folders cannot be multi-deleted)</ContextMenuItem>
		) : (
			<ContextMenuItem onClick={() => onGridAction?.("delete", null)}>
				{`Delete ${selectedKeys.length} objects`}
			</ContextMenuItem>
		);
	}

	if (contextRow?.kind === "object") {
		return (
			<>
				<ContextMenuItem onClick={() => (onOpenRow ? onOpenRow(contextRow) : onGridAction?.("open", contextRow))}>
					Open
				</ContextMenuItem>
				<ContextMenuItem onClick={() => onGridAction?.("system-open", contextRow)}>
					Open with system app
				</ContextMenuItem>
				<ContextMenuItem onClick={() => onGridAction?.("download", contextRow)}>Download</ContextMenuItem>
				<ContextMenuItem onClick={() => onGridAction?.("rename", contextRow)}>Rename or move</ContextMenuItem>
				<ContextMenuItem onClick={() => onGridAction?.("delete", contextRow)}>Delete</ContextMenuItem>
			</>
		);
	}

	if (contextRow?.kind === "folder") {
		return (
			<>
				<ContextMenuItem onClick={() => onNavigate(contextRow.prefix)}>Open</ContextMenuItem>
				<ContextMenuItem onClick={() => onGridAction?.("rename", contextRow)}>Rename folder</ContextMenuItem>
				<ContextMenuItem onClick={() => onGridAction?.("delete", contextRow)}>Delete folder</ContextMenuItem>
			</>
		);
	}

	return null;
}
