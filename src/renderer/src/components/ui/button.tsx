import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "../../lib/utils";

type Variant = "default" | "secondary" | "outline" | "destructive" | "ghost" | "link";
type Size = "sm" | "default" | "lg" | "icon" | "icon-sm" | "icon-lg";
export function Button({ className, variant = "default", size = "default", asChild = false, ...props }: React.ComponentProps<"button"> & { variant?: Variant; size?: Size; asChild?: boolean }) {
 const Component = asChild ? Slot.Root : "button";
 const variants: Record<Variant,string> = { default:"tds-btn--primary", secondary:"tds-btn--secondary", outline:"tds-btn--secondary", destructive:"tds-btn--danger", ghost:"tds-btn--invisible", link:"tds-btn--invisible" };
 const sizes: Record<Size,string> = { sm:"tds-btn--sm", default:"tds-btn--md", lg:"tds-btn--lg", icon:"tds-icon-btn tds-icon-btn--md", "icon-sm":"tds-icon-btn tds-icon-btn--sm", "icon-lg":"tds-icon-btn tds-icon-btn--lg" };
 return <Component data-slot="button" className={cn(size.startsWith("icon") ? sizes[size] : `tds-btn ${sizes[size]}`, variants[variant], className)} {...props}/>;
}
