import type { ReactNode } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";

export interface AppShellProps {
	sidebar: ReactNode;
	main: ReactNode;
}

export function AppShell({ sidebar, main }: AppShellProps) {
	return (
		<ResizablePanelGroup className="flex h-screen w-screen overflow-hidden bg-surface" orientation="horizontal">
			<ResizablePanel id="sidebar" defaultSize="22%" minSize="15%">
				{sidebar}
			</ResizablePanel>
			<ResizableHandle />
			<ResizablePanel id="main" defaultSize="78%" minSize="35%">
				{main}
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
