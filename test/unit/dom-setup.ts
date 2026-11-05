if (typeof window !== "undefined" && window.navigator?.userAgent.includes("jsdom")) {
	class ResizeObserverPolyfill {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	globalThis.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView ??= () => {};
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
}
