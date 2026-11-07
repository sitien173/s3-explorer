import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { render as rtlRender, renderHook as rtlRenderHook, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { createQueryClient } from "../../src/renderer/src/queries";

/** Testing Library render with a fresh QueryClient per call, so cached data never leaks between tests. */
export function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
	const client = createQueryClient();
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return rtlRender(ui, { ...options, wrapper });
}

/** renderHook counterpart that shares the caller's QueryClient so tests can seed and inspect its cache. */
export function renderHookWithQuery<T>(callback: () => T, client: QueryClient = createQueryClient()) {
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return rtlRenderHook(callback, { wrapper });
}
