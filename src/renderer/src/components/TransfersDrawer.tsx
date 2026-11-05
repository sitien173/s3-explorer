import { type JSX } from "react";
import { formatBytes } from "../format";
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

	return <>
		<Button variant="secondary" size="sm" aria-expanded={isOpen} onClick={onToggle} aria-label={isOpen ? "Collapse transfers" : "Expand transfers"}>
			Transfers {activeCount > 0 ? `${activeCount} active` : `(${transfers.length})`}
		</Button>
		<Sheet open={isOpen} onOpenChange={onToggle}>
			<SheetContent side="right" aria-label="Transfers" showCloseButton={false}>
				<SheetHeader><SheetTitle>Transfers</SheetTitle><SheetClose asChild><Button variant="ghost" size="icon" aria-label="Close transfers">×</Button></SheetClose></SheetHeader>
				<div className="app-transfers-body" data-testid="transfers-scroll-container">
				<ul className="app-transfers-list">
					{transfers.map((item) => {
						const fileName = item.key.split("/").pop() || item.key;
						const pct = item.total > 0 ? Math.min(100, Math.round((item.loaded / item.total) * 100)) : 0;
						return <li key={item.transferId} className="app-transfer-item">
							<div className="app-transfer-row"><div className="app-transfer-meta">
								<span className="tds-tag tds-tag--sm tds-tag--default">{item.kind === "upload" ? "Upload" : "Download"}</span>
								<span className="app-transfer-name" title={item.key}>{fileName}</span>
							</div><div className="app-transfer-status-meta">
								<span className="app-transfer-bytes">{formatBytes(item.loaded)} / {formatBytes(item.total)}</span>
								<span className={`app-transfer-status app-transfer-status--${item.status}`}>{item.status}</span>
								{item.status === "running" && <Button variant="ghost" size="icon-sm" aria-label="Cancel transfer" onClick={() => onCancel(item.transferId)}>×</Button>}
							</div></div>
							<div className="app-transfer-progress"><ol className="tds-progress-indicator tds-progress-indicator--horizontal app-transfer-progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><li className={`tds-progress-indicator__item app-transfer-progress-item ${item.status === "completed" ? "tds-progress-indicator__item--completed" : item.status === "failed" || item.status === "cancelled" ? "tds-progress-indicator__item--error" : "tds-progress-indicator__item--current"}`}><div className="tds-progress-indicator__line app-transfer-progress-line" style={{ width: `${pct}%` }} aria-hidden="true" /></li></ol><span className="app-transfer-pct">{pct}%</span></div>
							{item.error && <div className="app-transfer-error">{item.error}</div>}
						</li>;
					})}
				</ul>
				</div>
			</SheetContent>
		</Sheet>
	</>;
}
