import * as React from "react";
export function Badge({ className, ...props }: React.ComponentProps<"span">) { return <span className={`tds-tag ${className ?? ""}`} {...props}/>; }
