import * as React from "react";
import { cn } from "../../lib/utils";

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
	return <nav aria-label="Breadcrumb" className={cn("tds-breadcrumbs", className)} {...props} />;
}
function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) { return <ol className={cn("app-breadcrumb-list", className)} {...props} />; }
function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) { return <li className={className} {...props} />; }
function BreadcrumbLink({ className, ...props }: React.ComponentProps<"button">) { return <button className={cn("tds-breadcrumb-item", className)} {...props} />; }
function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) { return <span aria-current="page" className={cn("tds-breadcrumb-item tds-breadcrumb-item--current", className)} {...props} />; }
function BreadcrumbSeparator({ className, children = "/", ...props }: React.ComponentProps<"span">) { return <span aria-hidden="true" className={cn("tds-breadcrumb-divider", className)} {...props}>{children}</span>; }
export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator };
