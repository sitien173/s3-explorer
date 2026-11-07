import type * as React from "react";
import { cn } from "../../lib/utils";

export const BANNER_BASE_CLASS =
	"flex items-start gap-2 rounded-surface border bg-surface px-3 py-2.5 text-base text-foreground";
export const BANNER_DESTRUCTIVE_CLASS = `${BANNER_BASE_CLASS} border-destructive`;
export const BANNER_SEPARATOR_CLASS = `${BANNER_BASE_CLASS} border-separator`;

function Alert({ className, ...props }: React.ComponentProps<"div">) {
	return <div role="status" className={cn("w-full", BANNER_SEPARATOR_CLASS, className)} {...props} />;
}
function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("font-semibold text-foreground", className)} {...props} />;
}
function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("text-foreground-secondary", className)} {...props} />;
}
export { Alert, AlertTitle, AlertDescription };
