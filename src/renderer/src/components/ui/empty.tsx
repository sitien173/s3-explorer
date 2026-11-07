import type * as React from "react";
import { cn } from "../../lib/utils";

function Empty({ className, ...props }: React.ComponentProps<"div">) {
	return <div data-slot="empty" className={cn(className)} {...props} />;
}
function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={className} {...props} />;
}
function EmptyTitle({ className, ...props }: React.ComponentProps<"h2">) {
	return <h2 className={className} {...props} />;
}
function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
	return <p className={className} {...props} />;
}
function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={className} {...props} />;
}
export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent };
