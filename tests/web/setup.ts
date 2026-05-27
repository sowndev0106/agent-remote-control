import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  if (typeof ResizeObserver === "undefined") {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
  }
  if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }
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
