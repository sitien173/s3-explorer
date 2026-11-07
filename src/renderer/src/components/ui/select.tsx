import type * as React from "react";
import { cn } from "../../lib/utils";
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<select
			className={cn(
				"h-8 w-full min-w-0 rounded-control border border-input bg-background px-2 text-base text-foreground transition-colors duration-150 ease-out focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}
