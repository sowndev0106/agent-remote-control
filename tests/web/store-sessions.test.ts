import { beforeEach, describe, expect, it } from "vitest";
import { useSessions } from "../../src/web/stores/sessions.js";
import { mockFetchErr, mockFetchOk, resetStores } from "./helpers.js";

beforeEach(() => resetStores());

const session = {
  sessionId: "s1",
  providerId: "antigravity",
  source: "cdp",
  status: "ready",
  lifecycle: "running",
  owned: true,
  capabilities: {},
};

describe("sessions store", () => {
  it("launch sets active and status=connected on success", async () => {
    mockFetchOk({ session });
    const out = await useSessions.getState().launch("p1", "antigravity");
    expect(out.sessionId).toBe("s1");
    expect(useSessions.getState().status).toBe("connected");
    expect(useSessions.getState().active?.sessionId).toBe("s1");
  });

  it("launch failure sets status=error and rethrows", async () => {
    mockFetchErr(
      { code: "launch_failed", operation: "POST", message: "no CDP target" },
      502,
    );
    await expect(useSessions.getState().launch("p1")).rejects.toThrow();
    const state = useSessions.getState();
    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe("no CDP target");
  });

  it("attach sets active session", async () => {
    mockFetchOk({ session });
    await useSessions.getState().attach("s1");
    expect(useSessions.getState().active?.sessionId).toBe("s1");
  });

  it("sendPrompt with no active session throws a rejected error", async () => {
    await expect(useSessions.getState().sendPrompt("hi")).rejects.toThrow(
      /No active session/,
    );
  });

  it("performAction sends only the server-issued actionId", async () => {
    useSessions.setState({ active: session });
    const fetchFn = mockFetchOk(null);
    await useSessions.getState().performAction("act-42");
    const url = String(fetchFn.mock.calls[0]![0]);
    expect(url).toBe("/api/sessions/s1/actions/act-42");
    const body = (fetchFn.mock.calls[0]![1] as RequestInit).body;
    expect(body == null || !String(body).match(/selector|xpath|css/i)).toBe(true);
  });

  it("refreshSnapshot is a no-op when there is no active session", async () => {
    const fetchFn = mockFetchOk({ snapshot: { hash: "x", capturedAt: 0 } });
    await useSessions.getState().refreshSnapshot();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("setError moves status to error and back to connected when cleared", () => {
    useSessions.getState().setError("boom");
    expect(useSessions.getState().status).toBe("error");
    useSessions.getState().setError(null);
    expect(useSessions.getState().status).toBe("connected");
  });
});
