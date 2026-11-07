import type * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "../../lib/utils";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuPortal = ContextMenuPrimitive.Portal;
export const ContextMenuSub = ContextMenuPrimitive.SubmenuRoot;
export const ContextMenuSubTrigger = ContextMenuPrimitive.SubmenuTrigger;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;
export const ContextMenuRadioItem = ContextMenuPrimitive.RadioItem;
export const ContextMenuCheckboxItem = ContextMenuPrimitive.CheckboxItem;

export function ContextMenuItem({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Item>) {
	return (
		<ContextMenuPrimitive.Item
			className={cn(
				"flex min-h-7 cursor-default items-center gap-2 rounded-control px-2 py-1 text-base text-foreground outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export function ContextMenuContent({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Popup>) {
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Positioner className="z-[1100]">
				<ContextMenuPrimitive.Popup
					className={cn(
						"flex min-w-40 max-w-[calc(100vw-2rem)] origin-(--transform-origin) flex-col overflow-y-auto rounded-overlay border border-separator bg-elevated p-1 shadow-overlay outline-none transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
						className,
					)}
					{...props}
				/>
			</ContextMenuPrimitive.Positioner>
		</ContextMenuPrimitive.Portal>
	);
}

export function ContextMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
	return <ContextMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-separator", className)} {...props} />;
}
