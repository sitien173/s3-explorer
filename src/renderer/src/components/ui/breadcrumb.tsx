import type * as React from "react";
import { cn } from "../../lib/utils";

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
	return <nav aria-label="Breadcrumb" className={cn("flex min-w-0 items-center text-base", className)} {...props} />;
}
function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
	return <ol className={cn("m-0 flex list-none flex-wrap items-center gap-1 p-0", className)} {...props} />;
}
function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
	return <li className={className} {...props} />;
}
function BreadcrumbLink({ className, ...props }: React.ComponentProps<"button">) {
	return (
		<button
			className={cn(
				"cursor-default rounded-control px-1 text-accent hover:underline hover:underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
				className,
			)}
			{...props}
		/>
	);
}
function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
	return <span aria-current="page" className={cn("px-1 font-medium text-foreground", className)} {...props} />;
}
function BreadcrumbSeparator({ className, children = "/", ...props }: React.ComponentProps<"span">) {
	return (
		<span aria-hidden="true" className={cn("text-foreground-tertiary", className)} {...props}>
			{children}
		</span>
	);
}
export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator };
