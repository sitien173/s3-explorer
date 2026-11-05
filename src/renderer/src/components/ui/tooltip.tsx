import * as React from "react";
import { Tooltip as Primitive } from "radix-ui";
export const TooltipProvider = Primitive.Provider;
export const Tooltip = Primitive.Root;
export const TooltipTrigger = Primitive.Trigger;
export function TooltipContent({ className, ...props }: React.ComponentProps<typeof Primitive.Content>) { return <Primitive.Portal><Primitive.Content className={`tds-tooltip tds-tooltip--dark ${className ?? ""}`} {...props}/></Primitive.Portal>; }
