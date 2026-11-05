import * as React from "react";
export function Spinner({ className, ...props }: React.ComponentProps<"span">) { return <span role="status" className={`tds-spinner ${className ?? ""}`} {...props}/>; }
