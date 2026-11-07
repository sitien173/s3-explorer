import { Button } from "./ui/button";
import type { JSX } from "react";
import { AlertDescription, AlertTitle, BANNER_DESTRUCTIVE_CLASS } from "./ui/alert";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "../lib/utils";

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
				<div className="flex w-full items-center justify-end gap-2">
					<Button type="button" variant="default" onClick={onClose}>
						Close
					</Button>
				</div>
			}
		>
			<div className="flex flex-col gap-3">
				{error && (
					<div className={cn("mb-2", BANNER_DESTRUCTIVE_CLASS)}>
						<div className="min-w-0 flex-1">
							<AlertTitle>Operation stopped with error</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</div>
					</div>
				)}

				<div className="flex gap-4 rounded-surface bg-surface p-3">
					<div className="flex flex-col gap-1">
						<span className="text-sm uppercase tracking-wider text-foreground-secondary">Completed</span>
						<span className="text-base font-semibold text-foreground">{completedCount.toLocaleString()}</span>
					</div>
					<div className="flex flex-col gap-1">
						<span className="text-sm uppercase tracking-wider text-foreground-secondary">Remaining</span>
						<span className="text-base font-semibold text-foreground">{remainingKeys.length.toLocaleString()}</span>
					</div>
				</div>

				{remainingKeys.length > 0 && (
					<div className="flex flex-col gap-1">
						<div className="text-sm font-semibold text-foreground-secondary">Remaining objects (no rollback):</div>
						<div className="max-h-50 overflow-y-auto rounded-surface border border-separator bg-background p-1">
							<ul className="m-0 flex list-none flex-col gap-1 p-0">
								{visibleKeys.map((k) => (
									<li
										key={k}
										className="break-all rounded-control bg-surface px-2 py-1 font-mono text-sm text-foreground"
									>
										{k}
									</li>
								))}
							</ul>
							{hiddenCount > 0 && (
								<div className="px-2 py-1 text-sm italic text-foreground-secondary">
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
