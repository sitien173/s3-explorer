import type * as React from "react";
import { cn } from "../../lib/utils";
export function Badge({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium text-foreground-secondary",
				className,
			)}
			{...props}
		/>
	);
}
