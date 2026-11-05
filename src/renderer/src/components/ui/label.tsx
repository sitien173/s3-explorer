import * as React from "react";
export function Label({ className, ...props }: React.ComponentProps<"label">) { return <label className={className ?? "tds-field-label"} {...props}/>; }
