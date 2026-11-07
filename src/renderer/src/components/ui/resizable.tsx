import type * as React from "react";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { cn } from "../../lib/utils";

function ResizablePanelGroup({ className, ...props }: React.ComponentProps<typeof Group>) {
	return <Group className={cn("flex h-full w-full", className)} {...props} />;
}
function ResizablePanel(props: React.ComponentProps<typeof Panel>) {
	return <Panel {...props} />;
}
function ResizableHandle({ className, ...props }: React.ComponentProps<typeof Separator>) {
	return (
		<Separator
			className={cn(
				"relative z-10 w-px cursor-col-resize bg-separator transition-colors duration-150 ease-out after:absolute after:inset-y-0 after:-inset-x-1 after:content-[''] hover:bg-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
				className,
			)}
			{...props}
		/>
	);
}
export { ResizablePanelGroup, ResizablePanel, ResizableHandle, useDefaultLayout };
