import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsView } from "../../src/web/components/SettingsView.js";
import { mockFetchErr, mockFetchOk, renderWithRouter, resetStores } from "./helpers.js";

beforeEach(() => resetStores());

describe("SettingsView", () => {
  it("renders the config JSON once loaded", async () => {
    mockFetchOk({
      server: {
        host: "127.0.0.1",
        port: 4096,
        https: false,
        sessionIdleTimeoutMs: 1,
      },
      projects: { roots: [] },
      providers: {
        antigravity: {
          command: "antigravity",
          debugPortRange: [9000, 9100],
          wrapperCommands: [],
        },
      },
    });
    renderWithRouter(<SettingsView />);
    expect(await screen.findByText(/127\.0\.0\.1/)).toBeInTheDocument();
  });

  it("renders the bind 0.0.0.0 risk note", () => {
    mockFetchErr({ code: "x", operation: "GET", message: "404" }, 404);
    renderWithRouter(<SettingsView />);
    expect(
      screen.getByText(/bind 0\.0\.0\.0 requires a non-default password/i),
    ).toBeInTheDocument();
  });
});
