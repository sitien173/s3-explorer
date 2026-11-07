import * as React from "react";
import { Dialog as Primitive } from "@base-ui/react/dialog";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { useFinalFocus } from "./dialog";

const FinalFocusContext = React.createContext<ReturnType<typeof useFinalFocus> | undefined>(undefined);

// Opener focus capture relies on the controlled open prop to snapshot activeElement on open transition.
function Sheet({ open, ...props }: React.ComponentProps<typeof Primitive.Root>) {
	const finalFocus = useFinalFocus(Boolean(open));
	return (
		<FinalFocusContext.Provider value={finalFocus}>
			<Primitive.Root open={open} {...props} />
		</FinalFocusContext.Provider>
	);
}
const SheetTrigger = Primitive.Trigger;
const SheetClose = Primitive.Close;
const SheetPortal = Primitive.Portal;

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof Primitive.Backdrop>) {
	return (
		<Primitive.Backdrop
			data-slot="sheet-overlay"
			className={cn(
				"absolute inset-0 bg-scrim transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
				className,
			)}
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
}: React.ComponentProps<typeof Primitive.Popup> & {
	side?: "top" | "right" | "bottom" | "left";
	showCloseButton?: boolean;
}) {
	const finalFocus = React.useContext(FinalFocusContext);
	return (
		<SheetPortal>
			<div
				className={cn(
					"fixed inset-0 z-[1000] flex p-2",
					side === "right" && "items-stretch justify-end",
					side === "left" && "items-stretch justify-start",
					side === "bottom" && "items-end justify-center",
					side === "top" && "items-start justify-center",
				)}
			>
				<SheetOverlay />
				<Primitive.Popup
					data-slot="sheet-content"
					finalFocus={finalFocus}
					className={cn(
						"relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-overlay border border-separator bg-elevated text-foreground shadow-overlay transition-[opacity,transform] duration-200 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
						className,
					)}
					{...props}
				>
					{children}
					{showCloseButton && (
						<Primitive.Close
							render={<Button variant="ghost" size="icon" aria-label="Close" className="absolute top-3 right-3" />}
						>
							×
						</Primitive.Close>
					)}
				</Primitive.Popup>
			</div>
		</SheetPortal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"header">) {
	return (
		<header
			data-slot="sheet-header"
			className={cn("flex flex-col gap-1 border-b border-separator px-4 py-3", className)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"footer">) {
	return (
		<footer
			data-slot="sheet-footer"
			className={cn("flex items-center justify-end gap-2 border-t border-separator px-4 py-3", className)}
			{...props}
		/>
	);
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof Primitive.Title>) {
	return (
		<Primitive.Title
			data-slot="sheet-title"
			className={cn("m-0 text-lg font-semibold text-foreground", className)}
			{...props}
		/>
	);
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof Primitive.Description>) {
	return (
		<Primitive.Description
			data-slot="sheet-description"
			className={cn("text-foreground-secondary", className)}
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
