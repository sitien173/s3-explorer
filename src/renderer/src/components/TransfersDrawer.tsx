import { type JSX } from "react";
import { formatBytes } from "../format";

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

export function TransfersDrawer({
	transfers,
	isOpen,
	onToggle,
	onCancel,
}: TransfersDrawerProps): JSX.Element | null {
	if (transfers.length === 0) {
		return null;
	}

	const activeCount = transfers.filter((t) => t.status === "running").length;

	return (
		<div
			className={`app-transfers-drawer ${isOpen ? "app-transfers-drawer--open" : "app-transfers-drawer--collapsed"}`}
		>
			<button
				type="button"
				className="app-transfers-header"
				onClick={onToggle}
				aria-expanded={isOpen}
				aria-label={isOpen ? "Collapse transfers" : "Expand transfers"}
			>
				<div className="app-transfers-header-title">
					<span>Transfers</span>
					{activeCount > 0 && (
						<span className="tds-tag tds-tag--sm tds-tag--intermediate">
							{activeCount} active
						</span>
					)}
					{activeCount === 0 && (
						<span className="app-transfers-header-count">
							({transfers.length})
						</span>
					)}
				</div>
				<span
					className="tds-icon-btn tds-icon-btn--invisible tds-icon-btn--sm"
					aria-hidden="true"
				>
					<svg
						width="12"
						height="12"
						viewBox="0 0 12 12"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						aria-hidden="true"
						className={`app-transfers-chevron ${isOpen ? "app-transfers-chevron--open" : ""}`}
					>
						<path d="M2 4l4 4 4-4" />
					</svg>
				</span>
			</button>

			{isOpen && (
				<div className="app-transfers-body">
					<ul className="app-transfers-list">
						{transfers.map((item) => {
							const fileName = item.key.split("/").pop() || item.key;
							const pct =
								item.total > 0
									? Math.min(
											100,
											Math.round((item.loaded / item.total) * 100),
										)
									: 0;

							return (
								<li
									key={item.transferId}
									className="app-transfer-item"
								>
									<div className="app-transfer-row">
										<div className="app-transfer-meta">
											<span
												className={`tds-tag tds-tag--sm ${item.kind === "upload" ? "tds-tag--default" : "tds-tag--default"}`}
											>
												{item.kind === "upload"
													? "Upload"
													: "Download"}
											</span>
											<span
												className="app-transfer-name"
												title={item.key}
											>
												{fileName}
											</span>
										</div>

										<div className="app-transfer-status-meta">
											<span className="app-transfer-bytes">
												{formatBytes(item.loaded)} /{" "}
												{formatBytes(item.total)}
											</span>
											<span
												className={`app-transfer-status app-transfer-status--${item.status}`}
											>
												{item.status}
											</span>
											{item.status === "running" && (
												<button
													type="button"
													className="tds-icon-btn tds-icon-btn--invisible tds-icon-btn--sm"
													aria-label="Cancel transfer"
													onClick={() => onCancel(item.transferId)}
												>
													<svg
														width="10"
														height="10"
														viewBox="0 0 12 12"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
														strokeLinecap="round"
														aria-hidden="true"
													>
														<path d="M1 1l10 10M11 1L1 11" />
													</svg>
												</button>
											)}
										</div>
									</div>

									<div className="app-transfer-progress">
										<ol
											className="tds-progress-indicator tds-progress-indicator--horizontal app-transfer-progress-bar"
											role="progressbar"
											aria-valuenow={pct}
											aria-valuemin={0}
											aria-valuemax={100}
										>
											<li
												className={`tds-progress-indicator__item app-transfer-progress-item ${
													item.status === "completed"
														? "tds-progress-indicator__item--completed"
														: item.status === "failed" ||
															  item.status === "cancelled"
															? "tds-progress-indicator__item--error"
															: "tds-progress-indicator__item--current"
												}`}
											>
												<div
													className="tds-progress-indicator__line app-transfer-progress-line"
													style={{ width: `${pct}%` }}
													aria-hidden="true"
												/>
											</li>
										</ol>
										<span className="app-transfer-pct">
											{pct}%
										</span>
									</div>

									{item.error && (
										<div className="app-transfer-error">
											{item.error}
										</div>
									)}
								</li>
							);
						})}
					</ul>
				</div>
			)}
		</div>
	);
}
