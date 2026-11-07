import * as React from "react";
import { AlertDialog as Primitive } from "@base-ui/react/alert-dialog";
import { Button } from "./button";
import { useFinalFocus } from "./dialog";

export function AlertDialog({
	isOpen,
	title,
	onClose,
	children,
	footer,
}: {
	isOpen: boolean;
	title: string;
	onClose: () => void;
	children: React.ReactNode;
	footer?: React.ReactNode;
}) {
	const finalFocus = useFinalFocus(isOpen);
	const titleId = React.useId();
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
						aria-labelledby={titleId}
						aria-describedby={undefined}
						finalFocus={finalFocus}
					>
						<header className="flex flex-col">
							<div className="flex items-center justify-between gap-2 px-4 py-3">
								<Primitive.Title className="m-0 text-lg font-semibold text-foreground" id={titleId}>
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
