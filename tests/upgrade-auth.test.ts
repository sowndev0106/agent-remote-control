// tests/upgrade-auth.test.ts
import { describe, it, expect } from "vitest";
import { authenticateUpgrade, parseCookies } from "../src/server/core/realtime/upgrade-auth.js";

describe("parseCookies", () => {
  it("parses a normal cookie header", () => {
    expect(parseCookies("a=1; b=2; c=hello%20world")).toEqual({
      a: "1",
      b: "2",
      c: "hello world",
    });
  });

  it("returns empty object for empty header", () => {
    expect(parseCookies("")).toEqual({});
  });
});

describe("authenticateUpgrade", () => {
  function fakeUnsign(ok: boolean) {
    return (raw: string) =>
      ok ? { valid: true as const, value: "sess-" + raw } : { valid: false as const, value: null };
  }

  it("returns the session id when cookie unsigns and store has it", () => {
    const result = authenticateUpgrade({
      cookieHeader: "arc_sid=signed-value",
      unsignCookie: fakeUnsign(true),
      sessionsHas: (id) => id === "sess-signed-value",
    });
    expect(result).toEqual({ ok: true, sessionId: "sess-signed-value" });
  });

  it("rejects when no cookie", () => {
    expect(
      authenticateUpgrade({
        cookieHeader: "",
        unsignCookie: fakeUnsign(true),
        sessionsHas: () => true,
      }),
    ).toEqual({ ok: false, reason: "no_cookie" });
  });

  it("rejects when unsign fails", () => {
    expect(
      authenticateUpgrade({
        cookieHeader: "arc_sid=bad",
        unsignCookie: fakeUnsign(false),
        sessionsHas: () => true,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects when session is unknown to the store", () => {
    expect(
      authenticateUpgrade({
        cookieHeader: "arc_sid=signed-value",
        unsignCookie: fakeUnsign(true),
        sessionsHas: () => false,
      }),
    ).toEqual({ ok: false, reason: "unknown_session" });
  });
});
