import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MirrorTimeline } from "../../src/web/components/MirrorTimeline.js";
import { useSessions } from "../../src/web/stores/sessions.js";
import { renderWithRouter, resetStores } from "./helpers.js";

beforeEach(() => {
  resetStores();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("MirrorTimeline", () => {
  it("shows the idle placeholder before a session is attached", () => {
    renderWithRouter(<MirrorTimeline />);
    expect(screen.getByText(/attach a session to see the live mirror/i)).toBeInTheDocument();
  });

  it("renders the snapshot inside a sandboxed iframe", () => {
    useSessions.setState({
      status: "connected",
      snapshot: {
        hash: "abc",
        capturedAt: Date.now(),
        html: "<p>mirror body</p>",
      },
    });
    renderWithRouter(<MirrorTimeline />);
    const iframe = screen.getByTestId("mirror-iframe") as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(iframe).not.toHaveAttribute("srcdoc", expect.stringContaining("dangerouslySetInnerHTML"));
    expect(iframe.getAttribute("srcdoc")).toContain("<p>mirror body</p>");
  });

  it("shows the error placeholder with the store error message", () => {
    useSessions.setState({ status: "error", errorMessage: "adapter exploded" });
    renderWithRouter(<MirrorTimeline />);
    expect(screen.getByText("adapter exploded")).toBeInTheDocument();
  });
});
