import { Button } from "./ui/button";
import { type JSX } from "react";
import { Dialog } from "@/components/ui/dialog";

export interface OperationReportProps {
	isOpen: boolean;
	title?: string;
	completedCount: number;
	remainingKeys: string[];
	error?: string | null;
	onClose: () => void;
}

export function OperationReport({
	isOpen,
	title = "Operation report",
	completedCount,
	remainingKeys,
	error,
	onClose,
}: OperationReportProps): JSX.Element | null {
	const visibleKeys = remainingKeys.slice(0, 50);
	const hiddenCount = remainingKeys.length - visibleKeys.length;

	return (
		<Dialog
			isOpen={isOpen}
			title={title}
			onClose={onClose}
			footer={
				<div className="app-dialog-footer-actions">
					<Button
						type="button"
						variant="default"
						onClick={onClose}
					>
						Close
					</Button>
				</div>
			}
		>
			<div className="app-report-layout">
				{error && (
					<div className="tds-announcement tds-announcement--negative app-dialog-banner">
						<div className="tds-announcement__content">
							<div className="tds-announcement__title">
								Operation stopped with error
							</div>
							<div className="tds-announcement__message">{error}</div>
						</div>
					</div>
				)}

				<div className="app-report-summary">
					<div className="app-report-stat">
						<span className="app-report-stat-label">Completed</span>
						<span className="app-report-stat-value">
							{completedCount.toLocaleString()}
						</span>
					</div>
					<div className="app-report-stat">
						<span className="app-report-stat-label">Remaining</span>
						<span className="app-report-stat-value">
							{remainingKeys.length.toLocaleString()}
						</span>
					</div>
				</div>

				{remainingKeys.length > 0 && (
					<div className="app-report-keys-section">
						<div className="app-report-keys-heading">
							Remaining objects (no rollback):
						</div>
						<div className="app-report-keys-scroll">
							<ul className="app-report-keys-list">
								{visibleKeys.map((k) => (
									<li key={k} className="app-report-key-item">
										{k}
									</li>
								))}
							</ul>
							{hiddenCount > 0 && (
								<div className="app-report-more-count">
									+{hiddenCount.toLocaleString()} more
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</Dialog>
	);
}
