import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionPanel } from "../../src/web/components/ActionPanel.js";
import { useSessions } from "../../src/web/stores/sessions.js";
import { renderWithRouter, resetStores } from "./helpers.js";

const session = {
  sessionId: "s1",
  providerId: "antigravity",
  source: "cdp",
  status: "ready",
  lifecycle: "running",
  owned: true,
  capabilities: { launch: "supported", attach: "unknown", stop: "unsupported" },
};

beforeEach(() => {
  resetStores();
});

describe("ActionPanel", () => {
  it("shows an empty state without a session", () => {
    renderWithRouter(<ActionPanel />);
    expect(screen.getByText(/no session attached/i)).toBeInTheDocument();
  });

  it("renders capabilities and server-issued actions", () => {
    useSessions.setState({
      active: session,
      actions: [{ actionId: "a1", label: "Accept", kind: "approval", enabled: true }],
    });
    renderWithRouter(<ActionPanel />);
    expect(screen.getByText("launch")).toBeInTheDocument();
    const button = screen.getByTestId("action-a1");
    expect(button).toHaveAttribute("data-action-id", "a1");
  });

  it("clicking an action calls performAction with its id only", async () => {
    const performAction = vi.fn(async () => {});
    useSessions.setState({
      active: session,
      performAction,
      actions: [{ actionId: "a1", label: "Accept", kind: "button", enabled: true }],
    });
    renderWithRouter(<ActionPanel />);
    await userEvent.click(screen.getByTestId("action-a1"));
    expect(performAction).toHaveBeenCalledWith("a1");
    expect(performAction).toHaveBeenCalledTimes(1);
  });

  it("disabled actions are not clickable", () => {
    useSessions.setState({
      active: session,
      actions: [{ actionId: "a2", label: "Run", kind: "button", enabled: false }],
    });
    renderWithRouter(<ActionPanel />);
    expect(screen.getByTestId("action-a2")).toBeDisabled();
  });
});
