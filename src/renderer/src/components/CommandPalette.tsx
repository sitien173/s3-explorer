import { useEffect, useMemo, useState, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog as Primitive } from "@base-ui/react/dialog";
import { Autocomplete } from "@base-ui/react/autocomplete";
import {
	ArrowLeftRight,
	Folder,
	FolderPlus,
	FolderUp,
	Globe,
	HardDrive,
	RotateCw,
	Search,
	Upload,
	UserPlus,
	type LucideIcon,
} from "lucide-react";
import { parseBreadcrumbs } from "../format";
import { bucketsQuery } from "../queries";
import { useShellStore } from "../store";
import { useFinalFocus } from "./ui/dialog";

export interface CommandPaletteProps {
	onUpload: () => void;
	onNewFolder: () => void;
	onOpenUrl: () => void;
	onRefresh: () => void;
	onAddConnection: () => void;
	onToggleTransfers: () => void;
	onNavigate: (prefix: string) => void;
	onSelectBucket: (connectionId: string, bucket: string) => void;
}

interface PaletteItem {
	id: string;
	label: string;
	group: "Navigation" | "Buckets" | "Actions";
	icon: LucideIcon;
	onSelect: () => void;
}

export function CommandPalette({
	onUpload,
	onNewFolder,
	onOpenUrl,
	onRefresh,
	onAddConnection,
	onToggleTransfers,
	onNavigate,
	onSelectBucket,
}: CommandPaletteProps): JSX.Element | null {
	const paletteOpen = useShellStore((s) => s.paletteOpen);
	const connectionId = useShellStore((s) => s.connectionId);
	const currentBucket = useShellStore((s) => s.bucket);
	const currentPrefix = useShellStore((s) => s.prefix);

	const [query, setQuery] = useState("");
	const finalFocus = useFinalFocus(paletteOpen);

	useEffect(() => {
		if (!paletteOpen) {
			setQuery("");
		}
	}, [paletteOpen]);

	const bucketsQ = useQuery({
		...bucketsQuery(connectionId ?? ""),
		enabled: Boolean(connectionId),
	});
	const buckets = bucketsQ.data?.buckets ?? [];

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			const isK = event.key === "k" || event.key === "K";
			if (!isK || (!event.ctrlKey && !event.metaKey) || event.altKey) {
				return;
			}

			const store = useShellStore.getState();

			if (store.paletteOpen) {
				event.preventDefault();
				store.setPaletteOpen(false);
				return;
			}

			if (
				store.dialog !== null ||
				store.viewerTarget !== null ||
				document.querySelector('[role="dialog"],[role="alertdialog"]') !== null
			) {
				return;
			}

			const active = document.activeElement;
			if (
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement ||
				(active instanceof HTMLElement && active.isContentEditable)
			) {
				return;
			}

			event.preventDefault();
			store.setPaletteOpen(true);
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const allItems = useMemo<PaletteItem[]>(() => {
		const navItems: PaletteItem[] = [];
		if (currentBucket) {
			if (currentPrefix) {
				const parts = currentPrefix.replace(/\/$/, "").split("/").filter(Boolean);
				parts.pop();
				const parentPrefix = parts.length > 0 ? `${parts.join("/")}/` : "";
				navItems.push({
					id: "nav:parent",
					label: `Go up to parent folder${parentPrefix ? ` (${parentPrefix})` : " (root)"}`,
					group: "Navigation",
					icon: FolderUp,
					onSelect: () => onNavigate(parentPrefix),
				});
			}

			const breadcrumbs = parseBreadcrumbs(currentBucket, currentPrefix);
			for (let i = 0; i < breadcrumbs.length - 1; i++) {
				const seg = breadcrumbs[i];
				if (!seg) continue;
				navItems.push({
					id: `nav:crumb:${seg.prefix || "root"}`,
					label: seg.prefix === "" ? `Go to root (${currentBucket})` : `Go to ${seg.name}/`,
					group: "Navigation",
					icon: Folder,
					onSelect: () => onNavigate(seg.prefix),
				});
			}
		}

		const bucketItems: PaletteItem[] = [];
		if (connectionId && buckets.length > 0) {
			for (const b of buckets) {
				bucketItems.push({
					id: `bucket:${b.name}`,
					label: b.name,
					group: "Buckets",
					icon: HardDrive,
					onSelect: () => onSelectBucket(connectionId, b.name),
				});
			}
		}

		const actionItems: PaletteItem[] = [];
		if (currentBucket) {
			actionItems.push(
				{
					id: "action:upload",
					label: "Upload",
					group: "Actions",
					icon: Upload,
					onSelect: onUpload,
				},
				{
					id: "action:new-folder",
					label: "New folder",
					group: "Actions",
					icon: FolderPlus,
					onSelect: onNewFolder,
				},
			);
		}
		actionItems.push({
			id: "action:open-url",
			label: "Open URL",
			group: "Actions",
			icon: Globe,
			onSelect: onOpenUrl,
		});
		if (currentBucket) {
			actionItems.push({
				id: "action:refresh",
				label: "Refresh",
				group: "Actions",
				icon: RotateCw,
				onSelect: onRefresh,
			});
		}
		actionItems.push(
			{
				id: "action:add-connection",
				label: "Add connection",
				group: "Actions",
				icon: UserPlus,
				onSelect: onAddConnection,
			},
			{
				id: "action:transfers",
				label: "Transfers",
				group: "Actions",
				icon: ArrowLeftRight,
				onSelect: onToggleTransfers,
			},
		);

		return [...bucketItems, ...navItems, ...actionItems];
	}, [
		currentBucket,
		currentPrefix,
		connectionId,
		buckets,
		onNavigate,
		onSelectBucket,
		onUpload,
		onNewFolder,
		onOpenUrl,
		onRefresh,
		onAddConnection,
		onToggleTransfers,
	]);

	const filteredItems = useMemo(() => {
		if (!query.trim()) return allItems;
		const q = query.toLowerCase();
		return allItems.filter((item) => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q));
	}, [allItems, query]);

	return (
		<Primitive.Root
			open={paletteOpen}
			onOpenChange={(open) => {
				if (!open) {
					useShellStore.getState().setPaletteOpen(false);
				}
			}}
		>
			<Primitive.Portal>
				<div className="fixed inset-0 z-[1000] flex items-start justify-center p-4 pt-[15vh]">
					<Primitive.Backdrop className="absolute inset-0 bg-scrim transition-opacity duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
					<Primitive.Popup
						className="relative flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-overlay border border-separator bg-elevated text-foreground shadow-overlay transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
						aria-label="Command palette"
						finalFocus={finalFocus}
					>
						<Autocomplete.Root
							inline
							open
							autoHighlight="always"
							items={filteredItems}
							filter={null}
							value={query}
							onValueChange={setQuery}
						>
							<div className="flex items-center gap-2 border-b border-separator px-3 py-2.5">
								<Search className="size-4 shrink-0 text-foreground-secondary" aria-hidden="true" />
								<Autocomplete.Input
									autoFocus
									placeholder="Type a command or search..."
									className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground-secondary focus:outline-none"
								/>
							</div>
							<Autocomplete.List className="max-h-[300px] overflow-y-auto p-1.5 text-sm">
								{filteredItems.map((item) => (
									<Autocomplete.Item
										key={item.id}
										value={item.label}
										aria-label={item.label}
										onClick={() => {
											item.onSelect();
											useShellStore.getState().setPaletteOpen(false);
										}}
										className="flex cursor-pointer items-center justify-between rounded-control px-2.5 py-1.5 text-foreground transition-colors hover:bg-foreground/[0.06] data-[highlighted]:bg-selection data-[highlighted]:text-foreground"
									>
										<div className="flex items-center gap-2">
											<item.icon className="size-4 shrink-0 text-foreground-secondary" aria-hidden="true" />
											<span>{item.label}</span>
										</div>
										<span className="text-xs text-foreground-tertiary">{item.group}</span>
									</Autocomplete.Item>
								))}
								<Autocomplete.Empty className="p-4 text-center text-xs text-foreground-secondary">
									No matching commands
								</Autocomplete.Empty>
							</Autocomplete.List>
						</Autocomplete.Root>
					</Primitive.Popup>
				</div>
			</Primitive.Portal>
		</Primitive.Root>
	);
}
