// tests/route-helpers.test.ts
import { describe, it, expect } from "vitest";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import {
  notFoundEnvelope,
  resolveSession,
  requireBodyString,
} from "../src/server/http/route-helpers.js";
import { AppError } from "../src/server/core/errors.js";

describe("resolveSession", () => {
  it("returns the session when it exists", () => {
    const reg = new AgentSessionRegistry();
    const s = AgentSessionRegistry.makeSession({
      providerId: "antigravity",
      source: "cdp",
      projectPath: "/x",
    });
    reg.set(s);
    expect(resolveSession(reg, s.sessionId)?.sessionId).toBe(s.sessionId);
  });

  it("returns undefined when unknown", () => {
    expect(resolveSession(new AgentSessionRegistry(), "missing")).toBeUndefined();
  });
});

describe("notFoundEnvelope", () => {
  it("produces a 404 AppError with the documented code", () => {
    const e = notFoundEnvelope("abc123", "session lookup");
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe("session_not_found");
    expect(e.httpStatus).toBe(404);
    expect(e.message).toContain("abc123");
  });
});

describe("requireBodyString", () => {
  it("returns the trimmed string when present", () => {
    expect(requireBodyString({ x: "hi" }, "x", "op")).toBe("hi");
  });

  it("throws AppError when missing", () => {
    expect(() => requireBodyString({}, "x", "session.prompt")).toThrowError(AppError);
  });

  it("throws AppError when wrong type", () => {
    expect(() => requireBodyString({ x: 42 }, "x", "op")).toThrowError(AppError);
  });

  it("the error code includes the field name (consistent error codes)", () => {
    try {
      requireBodyString({}, "projectId", "session.launch");
    } catch (err) {
      expect((err as AppError).code).toBe("projectId_required");
      expect((err as AppError).httpStatus).toBe(400);
    }
  });
});
