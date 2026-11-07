import type { JSX, ReactNode } from "react";
import {
	Download,
	FilePenLine,
	FolderPlus,
	Globe,
	LayoutGrid,
	List,
	RotateCw,
	Trash2,
	Upload,
	type LucideIcon,
} from "lucide-react";
import type { BrowserRow } from "../format";
import { cn } from "../lib/utils";
import { isMac } from "../platform";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export interface ToolbarProps {
	connectionId: string;
	bucket: string;
	prefix: string;
	selectedItem: BrowserRow | null;
	selectedCount?: number;
	hasFolderSelected?: boolean;
	viewMode?: "list" | "grid";
	onViewModeChange?: (viewMode: "list" | "grid") => void;
	breadcrumb?: ReactNode;
	search?: ReactNode;
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
	viewMode = "list",
	onViewModeChange,
	breadcrumb,
	search,
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

	const actions: ReadonlyArray<readonly [string, () => void, boolean, string, LucideIcon]> = [
		["Upload", onUpload, false, "Upload", Upload],
		["New folder", onNewFolder, false, "New folder", FolderPlus],
		["Download", onDownload, !isObjectSelected, "Download", Download],
		["Rename or move", onRename, !isSingleSelected, "Rename or move", FilePenLine],
		["Delete", onDelete, !canDelete, deleteTooltip, Trash2],
		["Open URL", onOpenUrl, false, "Open URL", Globe],
		["Refresh", onRefresh, false, "Refresh", RotateCw],
	];

	return (
		<TooltipProvider>
			<div
				className={cn(
					"flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-separator bg-background px-4 app-drag",
					!isMac && "app-overlay-inset",
				)}
				role="toolbar"
				aria-label="Bucket operations"
			>
				<div className="flex min-w-0 flex-1 items-center gap-3">
					{breadcrumb && <div className="min-w-0 shrink">{breadcrumb}</div>}
					{search && <div className="min-w-0 shrink-0">{search}</div>}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<div
						className="app-no-drag inline-flex items-center rounded-control border border-separator bg-surface p-0.5"
						role="group"
						aria-label="View mode"
					>
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className={cn(
											"size-6 text-foreground-secondary hover:text-foreground",
											viewMode === "list" && "bg-elevated text-foreground shadow-xs",
										)}
										aria-label="List view"
										aria-pressed={viewMode === "list"}
										onClick={() => onViewModeChange?.("list")}
									/>
								}
							>
								<List className="size-3.5 shrink-0" aria-hidden="true" />
								<span className="sr-only">List view</span>
							</TooltipTrigger>
							<TooltipContent>List view</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className={cn(
											"size-6 text-foreground-secondary hover:text-foreground",
											viewMode === "grid" && "bg-elevated text-foreground shadow-xs",
										)}
										aria-label="Grid view"
										aria-pressed={viewMode === "grid"}
										onClick={() => onViewModeChange?.("grid")}
									/>
								}
							>
								<LayoutGrid className="size-3.5 shrink-0" aria-hidden="true" />
								<span className="sr-only">Grid view</span>
							</TooltipTrigger>
							<TooltipContent>Grid view</TooltipContent>
						</Tooltip>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						{actions.map(([label, action, disabled, tooltip, Icon]) => (
							<Tooltip key={label}>
								<TooltipTrigger
									render={
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className="app-no-drag size-7 text-foreground-secondary hover:text-foreground"
											aria-label={label}
											onClick={action}
											disabled={disabled}
										/>
									}
								>
									<Icon className="size-4 shrink-0" aria-hidden="true" />
									<span className="sr-only">{label}</span>
								</TooltipTrigger>
								<TooltipContent>{tooltip}</TooltipContent>
							</Tooltip>
						))}
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}
