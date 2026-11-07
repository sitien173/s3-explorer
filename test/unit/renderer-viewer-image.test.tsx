// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "./render-with-query";
import { QuickLook } from "../../src/renderer/src/components/QuickLook";
import type { ViewerTarget } from "../../src/renderer/src/store";

const mocks = vi.hoisted(() => ({
	api: { stream: { open: vi.fn() }, files: { openWithSystemApp: vi.fn() } },
}));
vi.mock("../../src/renderer/src/api", () => ({
	api: mocks.api,
	IpcErrorWrapper: class extends Error {},
	unwrap: (result: any) => result.data,
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const target = (key: string): ViewerTarget => ({ kind: "s3", connectionId: "c1", bucket: "b1", key });

describe("Quick Look image errors", () => {
	it("retries an image that failed earlier when its target is shown again", async () => {
		mocks.api.stream.open.mockImplementation(async ({ key }: { key: string }) => ({
			ok: true,
			data: { url: `http://127.0.0.1/${key}`, contentType: "image/png", size: 1 },
		}));
		const show = (key: string) => (
			<QuickLook target={target(key)} getSiblings={() => []} onNavigate={vi.fn()} onClose={vi.fn()} />
		);
		const view = render(show("b.png"));
		await screen.findByRole("img", { name: "b.png" });
		view.rerender(show("a.png"));
		// The first error drops the handle and retries; the second shows the inline error.
		fireEvent.error(await screen.findByRole("img", { name: "a.png" }));
		fireEvent.error(await screen.findByRole("img", { name: "a.png" }));
		expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();

		view.rerender(show("b.png"));
		expect(await screen.findByRole("img", { name: "b.png" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
	});
});
