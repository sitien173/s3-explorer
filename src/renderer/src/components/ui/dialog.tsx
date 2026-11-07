import type * as React from "react";
import { useId, useLayoutEffect, useRef } from "react";
import { Dialog as Primitive } from "@base-ui/react/dialog";
import { Button } from "./button";

function canRefocus(el: HTMLElement | null): el is HTMLElement {
	if (!el?.isConnected || el === document.body) return false;
	if (el.matches(":disabled") || el.closest("[inert], [hidden]")) return false;
	if (getComputedStyle(el).visibility === "hidden") return false;
	for (let node: HTMLElement | null = el; node; node = node.parentElement)
		if (getComputedStyle(node).display === "none") return false;
	return true;
}

// Opener focus falls back to the table grid when the opener is gone or unusable, for example a context-menu item or a virtualized row.
export function useFinalFocus(isOpen: boolean) {
	const opener = useRef<HTMLElement | null>(null);
	useLayoutEffect(() => {
		if (isOpen) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	}, [isOpen]);
	return () => {
		const el = opener.current;
		opener.current = null;
		return canRefocus(el) ? el : document.querySelector<HTMLElement>('[role="grid"]');
	};
}

export function Dialog({
	isOpen,
	title,
	onClose,
	children,
	footer,
	titleId,
}: {
	isOpen: boolean;
	title: string;
	onClose: () => void;
	children: React.ReactNode;
	footer?: React.ReactNode;
	titleId?: string;
}) {
	const finalFocus = useFinalFocus(isOpen);
	const generatedTitleId = useId();
	const resolvedTitleId = titleId ?? generatedTitleId;
	return (
		<Primitive.Root
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<Primitive.Portal>
				<div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
					<Primitive.Backdrop className="absolute inset-0 bg-scrim transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
					<Primitive.Popup
						className="relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-overlay border border-separator bg-elevated text-foreground shadow-overlay transition-[opacity,transform] duration-200 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
						aria-label={title}
						aria-labelledby={resolvedTitleId}
						aria-describedby={undefined}
						finalFocus={finalFocus}
					>
						<header className="flex flex-col">
							<div className="flex items-center justify-between gap-2 px-4 py-3">
								<Primitive.Title className="m-0 text-lg font-semibold text-foreground" id={resolvedTitleId}>
									{title}
								</Primitive.Title>
								<Primitive.Close
									render={<Button variant="ghost" size="icon" aria-label="Dismiss" className="shrink-0" />}
								>
									×
								</Primitive.Close>
							</div>
							<div className="h-px bg-separator" role="presentation" />
						</header>
						<div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto p-4">{children}</div>
						{footer && (
							<footer className="flex flex-col">
								<div className="h-px bg-separator" role="presentation" />
								<div className="flex w-full items-center justify-between gap-2 px-4 py-3">{footer}</div>
							</footer>
						)}
					</Primitive.Popup>
				</div>
			</Primitive.Portal>
		</Primitive.Root>
	);
}
export const DialogTrigger = Primitive.Trigger;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export const DialogContent = Primitive.Popup;
export const DialogClose = Primitive.Close;
