import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SlashCommandPalette } from "../../src/web/components/SlashCommandPalette.js";
import { useSessions } from "../../src/web/stores/sessions.js";
import { renderWithRouter, resetStores } from "./helpers.js";

const session = {
  sessionId: "s1",
  providerId: "antigravity",
  source: "cdp",
  status: "ready",
  lifecycle: "running",
  owned: true,
  capabilities: {},
};

beforeEach(() => resetStores());

describe("SlashCommandPalette", () => {
  it("renders nothing when closed", () => {
    const { container } = renderWithRouter(
      <SlashCommandPalette open={false} onOpenChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("disables session-only commands when no session is attached", () => {
    renderWithRouter(<SlashCommandPalette open onOpenChange={() => {}} />);
    expect(screen.getByTestId("palette-cmd-new")).toHaveAttribute(
      "data-enabled",
      "false",
    );
    expect(screen.getByTestId("palette-cmd-settings")).toHaveAttribute(
      "data-enabled",
      "true",
    );
  });

  it("enables /new when a session is active", () => {
    useSessions.setState({ active: session });
    renderWithRouter(<SlashCommandPalette open onOpenChange={() => {}} />);
    expect(screen.getByTestId("palette-cmd-new")).toHaveAttribute(
      "data-enabled",
      "true",
    );
  });

  it("/files runs the onOpenFiles callback and closes", async () => {
    const onOpenFiles = vi.fn();
    const onOpenChange = vi.fn();
    renderWithRouter(
      <SlashCommandPalette
        open
        onOpenChange={onOpenChange}
        onOpenFiles={onOpenFiles}
      />,
    );
    await userEvent.click(screen.getByTestId("palette-cmd-files"));
    expect(onOpenFiles).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
