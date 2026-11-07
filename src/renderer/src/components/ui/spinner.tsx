import type * as React from "react";
import { cn } from "../../lib/utils";

export const SPINNER_CLASS =
	"inline-block rounded-full border-2 border-foreground/15 border-t-accent animate-spin motion-reduce:animate-pulse";

export function Spinner({ className, ...props }: React.ComponentProps<"span">) {
	return <span aria-hidden="true" className={cn("size-4 shrink-0", SPINNER_CLASS, className)} {...props} />;
}
