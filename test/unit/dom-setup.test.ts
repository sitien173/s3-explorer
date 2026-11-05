// @vitest-environment jsdom
import { expect, it } from "vitest";

it("loads DOM polyfills in jsdom", () => {
	expect(window.navigator.userAgent).toContain("jsdom");
	expect(typeof new ResizeObserver(() => {}).observe).toBe("function");
	expect(typeof Element.prototype.scrollIntoView).toBe("function");
	expect(typeof Element.prototype.hasPointerCapture).toBe("function");
	expect(typeof Element.prototype.setPointerCapture).toBe("function");
	expect(typeof Element.prototype.releasePointerCapture).toBe("function");
});
