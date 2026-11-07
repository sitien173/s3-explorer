import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

function Skeleton({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn("animate-pulse rounded-control bg-foreground/[0.06] motion-reduce:animate-none", className)}
			{...props}
		/>
	);
}

export { Skeleton };
