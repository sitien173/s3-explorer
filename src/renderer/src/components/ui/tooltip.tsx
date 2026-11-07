import type * as React from "react";
import { cn } from "../../lib/utils";
import { Tooltip as Primitive } from "@base-ui/react/tooltip";
export const TooltipProvider = Primitive.Provider;
export const Tooltip = Primitive.Root;
export const TooltipTrigger = Primitive.Trigger;
export function TooltipContent({ className, ...props }: React.ComponentProps<typeof Primitive.Popup>) {
	return (
		<Primitive.Portal>
			<Primitive.Positioner className="z-[1100]">
				<Primitive.Popup
					role="tooltip"
					className={cn(
						"max-w-80 origin-(--transform-origin) rounded-control bg-foreground px-2 py-1 text-xs text-background transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[instant]:duration-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
						className,
					)}
					{...props}
				/>
			</Primitive.Positioner>
		</Primitive.Portal>
	);
}
