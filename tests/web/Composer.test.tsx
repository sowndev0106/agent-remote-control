import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "../../src/web/components/Composer.js";
import { useFiles } from "../../src/web/stores/files.js";
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

describe("Composer", () => {
  it("disables the textarea when there is no active session", () => {
    renderWithRouter(<Composer onSlash={() => {}} />);
    expect(screen.getByPlaceholderText(/attach a session/i)).toBeDisabled();
  });

  it("sends the trimmed message and clears the box on submit", async () => {
    const sendPrompt = vi.fn(async () => {});
    useSessions.setState({ active: session, sendPrompt });
    renderWithRouter(<Composer onSlash={() => {}} />);
    const box = screen.getByPlaceholderText(/send a message/i);
    await userEvent.type(box, "hello world");
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(sendPrompt).toHaveBeenCalledWith("hello world");
    expect(box).toHaveValue("");
  });

  it("prepends @context chips to the message", async () => {
    const sendPrompt = vi.fn(async () => {});
    useSessions.setState({ active: session, sendPrompt });
    useFiles.setState({
      contextChips: [{ relPath: "src/a.ts", path: "/p/src/a.ts" }],
    });
    renderWithRouter(<Composer onSlash={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText(/send a message/i), "fix this");
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(sendPrompt).toHaveBeenCalledWith("@src/a.ts\n\nfix this");
  });

  it("opens the slash palette when '/' is the first key", async () => {
    const onSlash = vi.fn();
    useSessions.setState({ active: session });
    renderWithRouter(<Composer onSlash={onSlash} />);
    await userEvent.type(screen.getByPlaceholderText(/send a message/i), "/");
    expect(onSlash).toHaveBeenCalled();
  });

  it("Stop is enabled only while generating", () => {
    useSessions.setState({ active: session, status: "generating" });
    renderWithRouter(<Composer onSlash={() => {}} />);
    expect(screen.getByRole("button", { name: /stop/i })).toBeEnabled();
  });
});
