import * as React from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { cn } from "../../lib/utils";

function ResizablePanelGroup({ className, ...props }: React.ComponentProps<typeof Group>) {
	return <Group className={cn("app-resizable-group", className)} {...props} />;
}
function ResizablePanel(props: React.ComponentProps<typeof Panel>) { return <Panel {...props} />; }
function ResizableHandle({ className, ...props }: React.ComponentProps<typeof Separator>) {
	return <Separator className={cn("app-resizable-separator", className)} {...props} />;
}
export { ResizablePanelGroup, ResizablePanel, ResizableHandle, useDefaultLayout };
