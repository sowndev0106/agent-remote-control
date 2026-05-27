import { describe, it, expect } from "vitest";
import { issueCsrfToken, verifyCsrfToken } from "../src/server/core/csrf.js";

describe("csrf double-submit", () => {
  it("token verifies against itself", () => {
    const t = issueCsrfToken();
    expect(verifyCsrfToken(t, t)).toBe(true);
  });

  it("rejects mismatched tokens", () => {
    expect(verifyCsrfToken(issueCsrfToken(), issueCsrfToken())).toBe(false);
  });

  it("rejects empty header", () => {
    expect(verifyCsrfToken(issueCsrfToken(), "")).toBe(false);
    expect(verifyCsrfToken("", issueCsrfToken())).toBe(false);
    expect(verifyCsrfToken(undefined, "abc")).toBe(false);
  });

  it("constant-time-safe: tokens of different length return false", () => {
    expect(verifyCsrfToken("abc", "abcd")).toBe(false);
  });
});
