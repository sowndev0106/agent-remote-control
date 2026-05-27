import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function installBrowserShims() {
  if (typeof ResizeObserver === "undefined") {
    globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
  }
  if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }
  if (typeof HTMLCanvasElement !== "undefined") {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () => ({}),
    });
  }
}

installBrowserShims();

beforeEach(() => {
  installBrowserShims();
});

afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
    document.cookie = "";
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
