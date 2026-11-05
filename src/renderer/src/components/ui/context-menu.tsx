import * as React from "react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { cn } from "../../lib/utils";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuPortal = ContextMenuPrimitive.Portal;
export const ContextMenuSub = ContextMenuPrimitive.Sub;
export const ContextMenuSubTrigger = ContextMenuPrimitive.SubTrigger;
export const ContextMenuSubContent = ContextMenuPrimitive.SubContent;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;
export const ContextMenuRadioItem = ContextMenuPrimitive.RadioItem;
export const ContextMenuCheckboxItem = ContextMenuPrimitive.CheckboxItem;

export const ContextMenuItem = React.forwardRef<
	React.ElementRef<typeof ContextMenuPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
	<ContextMenuPrimitive.Item
		ref={ref}
		className={cn("tds-action-list-item", className)}
		{...props}
	/>
));
ContextMenuItem.displayName = "ContextMenuItem";

export const ContextMenuContent = React.forwardRef<
	React.ElementRef<typeof ContextMenuPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
	<ContextMenuPrimitive.Portal>
		<ContextMenuPrimitive.Content
			ref={ref}
			className={cn("tds-dropdown-panel", className)}
			{...props}
		/>
	</ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = "ContextMenuContent";

export const ContextMenuSeparator = ContextMenuPrimitive.Separator;
