// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppShell } from "../../src/renderer/src/components/AppShell";

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

const panelIds = () => Array.from(document.querySelectorAll("[data-panel]")).map((panel) => panel.getAttribute("id"));

it("renders the sidebar and main panes and no docked viewer pane", () => {
	render(<AppShell sidebar={<div>Sidebar</div>} main={<div>Main</div>} />);
	expect(screen.getByText("Sidebar")).toBeTruthy();
	expect(screen.getByText("Main")).toBeTruthy();
	expect(panelIds()).toEqual(["sidebar", "main"]);
	expect(document.querySelector('[data-panel-id="viewer"]')).toBeNull();
});

it("saves no layout or viewer width in localStorage", () => {
	render(<AppShell sidebar={<div>Sidebar</div>} main={<div>Main</div>} />);
	expect(localStorage.length).toBe(0);
});
