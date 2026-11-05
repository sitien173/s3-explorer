import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, useDefaultLayout } from "./ui/resizable";

export interface AppShellProps {
	sidebar: ReactNode;
	main: ReactNode;
	viewer: ReactNode;
	viewerOpen: boolean;
	onViewerClose?: () => void;
}

const LAST_VIEWER_WIDTH_KEY = "app-shell-last-viewer-width";

export function AppShell({ sidebar, main, viewer, viewerOpen, onViewerClose }: AppShellProps) {
	const viewerPanelRef = useRef<PanelImperativeHandle>(null);
	const viewerWasCollapsedRef = useRef(!viewerOpen);
	const { defaultLayout: savedLayout, ...layoutHandlers } = useDefaultLayout({ id: "app-shell" });
	const lastViewerWidth = Number(localStorage.getItem(LAST_VIEWER_WIDTH_KEY));
	// A collapsed viewer is saved as 0; seed its last open width so expand() restores it.
	const defaultLayout = useMemo(
		() => savedLayout?.viewer === 0 && savedLayout.main !== undefined && lastViewerWidth > 0
			? { ...savedLayout, viewer: lastViewerWidth, main: savedLayout.main - lastViewerWidth }
			: savedLayout,
		[savedLayout, lastViewerWidth],
	);

	useLayoutEffect(() => {
		viewerWasCollapsedRef.current = !viewerOpen;
		if (viewerOpen) viewerPanelRef.current?.expand();
		else viewerPanelRef.current?.collapse();
	}, [viewerOpen]);

	return <ResizablePanelGroup className="app-shell" orientation="horizontal" defaultLayout={defaultLayout} {...layoutHandlers}>
		<ResizablePanel id="sidebar" defaultSize="22%" minSize="15%">{sidebar}</ResizablePanel>
		<ResizableHandle />
		<ResizablePanel id="main" defaultSize="48%" minSize="35%">{main}</ResizablePanel>
		<ResizableHandle className={viewerOpen ? "" : "app-resizable-separator--hidden"} />
		<ResizablePanel id="viewer" defaultSize="30%" minSize="20%" collapsible collapsedSize="0%" panelRef={viewerPanelRef}
			onResize={(size) => {
				if (size.asPercentage > 0) {
					viewerWasCollapsedRef.current = false;
					localStorage.setItem(LAST_VIEWER_WIDTH_KEY, String(size.asPercentage));
				} else if (viewerOpen && !viewerWasCollapsedRef.current) {
					viewerWasCollapsedRef.current = true;
					onViewerClose?.();
				}
			}}>
			{viewerOpen ? viewer : null}
		</ResizablePanel>
	</ResizablePanelGroup>;
}
