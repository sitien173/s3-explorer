import type { JSX } from "react";
import { formatBytes } from "../format";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";

export interface TransferRecord {
	transferId: string;
	kind: "upload" | "download";
	bucket: string;
	key: string;
	loaded: number;
	total: number;
	status: "running" | "completed" | "cancelled" | "failed";
	error?: string;
}

export interface TransfersDrawerProps {
	transfers: TransferRecord[];
	isOpen: boolean;
	onToggle: () => void;
	onCancel: (transferId: string) => void;
}

export function TransfersDrawer({ transfers, isOpen, onToggle, onCancel }: TransfersDrawerProps): JSX.Element | null {
	if (transfers.length === 0) return null;
	const activeCount = transfers.filter((t) => t.status === "running").length;

	return (
		<>
			<Button
				variant="secondary"
				size="sm"
				aria-expanded={isOpen}
				onClick={onToggle}
				aria-label={isOpen ? "Collapse transfers" : "Expand transfers"}
			>
				Transfers {activeCount > 0 ? `${activeCount} active` : `(${transfers.length})`}
			</Button>
			<Sheet open={isOpen} onOpenChange={onToggle}>
				<SheetContent side="right" aria-label="Transfers" showCloseButton={false}>
					<SheetHeader>
						<SheetTitle>Transfers</SheetTitle>
						<SheetClose render={<Button variant="ghost" size="icon" aria-label="Close transfers" />}>×</SheetClose>
					</SheetHeader>
					<div className="max-h-60 flex-1 overflow-y-auto px-4 py-2" data-testid="transfers-scroll-container">
						<ul className="flex list-none flex-col gap-2">
							{transfers.map((item) => {
								const fileName = item.key.split("/").pop() || item.key;
								const pct = item.total > 0 ? Math.min(100, Math.round((item.loaded / item.total) * 100)) : 0;
								const barTone =
									item.status === "completed"
										? "bg-foreground"
										: item.status === "failed" || item.status === "cancelled"
											? "bg-destructive"
											: "bg-accent";
								return (
									<li
										key={item.transferId}
										className="flex flex-col gap-1 rounded-surface border border-separator bg-background p-2"
									>
										<div className="flex items-center justify-between gap-3">
											<div className="flex min-w-0 flex-1 items-center gap-2">
												<Badge>{item.kind === "upload" ? "Upload" : "Download"}</Badge>
												<span className="min-w-0 truncate text-xs font-semibold text-foreground" title={item.key}>
													{fileName}
												</span>
											</div>
											<div className="flex shrink-0 items-center gap-2">
												<span className="text-xs text-foreground-secondary">
													{formatBytes(item.loaded)} / {formatBytes(item.total)}
												</span>
												<span
													className={cn(
														"text-xs font-semibold capitalize",
														item.status === "running" && "text-accent",
														item.status === "completed" && "text-foreground",
														item.status === "failed" && "text-destructive",
														item.status === "cancelled" && "text-foreground-secondary",
													)}
												>
													{item.status}
												</span>
												{item.status === "running" && (
													<Button
														variant="ghost"
														size="icon-sm"
														aria-label="Cancel transfer"
														onClick={() => onCancel(item.transferId)}
													>
														×
													</Button>
												)}
											</div>
										</div>
										<div className="flex items-center gap-2">
											<ol
												className="flex h-1.5 flex-1 overflow-hidden rounded-control bg-foreground/[0.06]"
												role="progressbar"
												aria-valuenow={pct}
												aria-valuemin={0}
												aria-valuemax={100}
											>
												<li className="h-full min-w-0">
													<div
														className={cn("h-full transition-[width] duration-150 ease-out", barTone)}
														style={{ width: `${pct}%` }}
														aria-hidden="true"
													/>
												</li>
											</ol>
											<span className="min-w-8 text-right text-xs text-foreground-secondary">{pct}%</span>
										</div>
										{item.error && <div className="text-xs text-destructive">{item.error}</div>}
									</li>
								);
							})}
						</ul>
					</div>
				</SheetContent>
			</Sheet>
		</>
	);
}
