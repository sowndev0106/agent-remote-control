import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionDiscoveryList } from "../../src/web/components/SessionDiscoveryList.js";
import { useSessions } from "../../src/web/stores/sessions.js";
import { renderWithRouter, resetStores } from "./helpers.js";

beforeEach(() => resetStores());

describe("SessionDiscoveryList", () => {
  it("renders an empty hint and a launch button when nothing is discovered", () => {
    useSessions.setState({ discover: vi.fn(async () => {}) });
    renderWithRouter(<SessionDiscoveryList projectId="p1" />);
    expect(screen.getByText(/no antigravity cdp targets/i)).toBeInTheDocument();
    expect(screen.getByTestId("launch-session")).toBeInTheDocument();
  });

  it("an unmanaged session is shown as not controllable and attach is disabled", () => {
    useSessions.setState({
      discover: vi.fn(async () => {}),
      discovered: [
        {
          sessionId: "u1",
          providerId: "antigravity",
          source: "unmanaged",
          hint: "external pid 999",
          attachable: false,
          guidance: {
            message: "Launch via the app to control it.",
            recommendedCommand: "agent-remote-control open",
          },
        },
      ],
    });
    renderWithRouter(<SessionDiscoveryList projectId="p1" />);
    expect(screen.getByTestId("attach-u1")).toBeDisabled();
    expect(screen.getByText(/not controllable/i)).toBeInTheDocument();
    expect(screen.getByText(/launch via the app/i)).toBeInTheDocument();
  });

  it("a CDP session offers an enabled attach that calls store.attach", async () => {
    const attach = vi.fn(async () => ({} as never));
    useSessions.setState({
      discover: vi.fn(async () => {}),
      attach,
      discovered: [
        {
          sessionId: "c1",
          providerId: "antigravity",
          source: "cdp",
          hint: "tab 1",
          attachable: true,
        },
      ],
    });
    renderWithRouter(<SessionDiscoveryList projectId="p1" />);
    await userEvent.click(screen.getByTestId("attach-c1"));
    expect(attach).toHaveBeenCalledWith("c1");
  });
});
