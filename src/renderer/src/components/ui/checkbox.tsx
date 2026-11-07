import type * as React from "react";
import { cn } from "../../lib/utils";
export function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type="checkbox"
			className={cn("size-4 shrink-0 cursor-default accent-accent disabled:opacity-50", className)}
			{...props}
		/>
	);
}
