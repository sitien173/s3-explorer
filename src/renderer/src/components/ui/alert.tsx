import * as React from "react";
import { cn } from "../../lib/utils";

function Alert({ className, ...props }: React.ComponentProps<"div">) {
	return <div role="status" className={cn("tds-announcement", className)} {...props} />;
}
function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("tds-announcement__title", className)} {...props} />;
}
function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("tds-announcement__message", className)} {...props} />;
}
export { Alert, AlertTitle, AlertDescription };
