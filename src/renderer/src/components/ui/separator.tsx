import * as React from "react";
export function Separator({ className, ...props }: React.ComponentProps<"div">) { return <div role="separator" className={className} {...props}/>; }
