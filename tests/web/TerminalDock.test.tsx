import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ReactElement } from "react";
import { mockFetchRoutes, resetStores } from "./helpers.js";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    loadAddon() {}
    open() {}
    onData() {}
    onResize() {}
    write() {}
    dispose() {}
  },
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: class {} }));
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import { TerminalDock } from "../../src/web/components/TerminalDock.js";

class FakeWebSocket {
  readyState = 0;
  OPEN = 1;
  close() {}
  send() {}
}

beforeEach(() => {
  resetStores();
  vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  vi.stubGlobal("location", { protocol: "http:", host: "127.0.0.1:4096" });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(performance.now());
    return 1;
  });
});

describe("TerminalDock", () => {
  it("shows the empty hint when there are no tabs", async () => {
    mockFetchRoutes([{ match: "GET:/api/terminal/tabs", data: { tabs: [] } }]);
    renderBare(<TerminalDock projectId="p1" />);
    expect(await screen.findByText(/no terminal tabs/i)).toBeInTheDocument();
  });

  it("creates a new tab via + tab and shows its title", async () => {
    const tab = {
      id: "t1",
      title: "bash",
      projectPath: "/h/proj",
      cols: 80,
      rows: 24,
      alive: true,
    };
    mockFetchRoutes([
      { match: "GET:/api/terminal/tabs", data: { tabs: [] } },
      { match: "POST:/api/terminal/tabs", data: { tab } },
    ]);
    renderBare(<TerminalDock projectId="p1" />);
    await userEvent.click(screen.getByTestId("new-terminal-tab"));
    expect(await screen.findByText(/bash/)).toBeInTheDocument();
  });
});

function renderBare(ui: ReactElement) {
  return render(ui);
}
