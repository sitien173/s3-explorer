import * as React from "react";
import { Dialog as Primitive } from "radix-ui";
import { cn } from "../../lib/utils";
import { Button } from "./button";

const Sheet = Primitive.Root;
const SheetTrigger = Primitive.Trigger;
const SheetClose = Primitive.Close;
const SheetPortal = Primitive.Portal;

function SheetOverlay({
	className,
	...props
}: React.ComponentProps<typeof Primitive.Overlay>) {
	return (
		<Primitive.Overlay
			data-slot="sheet-overlay"
			className={cn("tds-dialog__backdrop", className)}
			{...props}
		/>
	);
}

function SheetContent({
	className,
	children,
	side = "right",
	showCloseButton = true,
	...props
}: React.ComponentProps<typeof Primitive.Content> & {
	side?: "top" | "right" | "bottom" | "left";
	showCloseButton?: boolean;
}) {
	return (
		<SheetPortal>
			<div
				className={cn(
					"tds-dialog tds-dialog--open",
					side === "right" && "tds-dialog--right tds-dialog--lg",
					side === "left" && "tds-dialog--left tds-dialog--lg",
					side === "bottom" && "tds-dialog--bottom",
				)}
			>
				<SheetOverlay>
					<Primitive.Content
						data-slot="sheet-content"
						className={cn("tds-dialog__panel", className)}
						{...props}
					>
						{children}
						{showCloseButton && (
							<Primitive.Close asChild>
								<Button
									variant="ghost"
									size="icon"
									aria-label="Close"
									className="tds-dialog__dismiss absolute top-4 right-4"
								>
									×
								</Button>
							</Primitive.Close>
						)}
					</Primitive.Content>
				</SheetOverlay>
			</div>
		</SheetPortal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"header">) {
	return (
		<header
			data-slot="sheet-header"
			className={cn("tds-dialog__header", className)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"footer">) {
	return (
		<footer
			data-slot="sheet-footer"
			className={cn("tds-dialog__footer", className)}
			{...props}
		/>
	);
}

function SheetTitle({
	className,
	...props
}: React.ComponentProps<typeof Primitive.Title>) {
	return (
		<Primitive.Title
			data-slot="sheet-title"
			className={cn("tds-dialog__title", className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: React.ComponentProps<typeof Primitive.Description>) {
	return (
		<Primitive.Description
			data-slot="sheet-description"
			className={cn("text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetTrigger,
	SheetClose,
	SheetPortal,
	SheetOverlay,
	SheetContent,
	SheetHeader,
	SheetFooter,
	SheetTitle,
	SheetDescription,
};
