import { describe, it, expect } from "vitest";
import { assertBindAllowed, bindBanner } from "../src/server/core/bind-guard.js";
import { AppError } from "../src/server/core/errors.js";
import { defaultConfig } from "../src/server/core/config.js";

describe("bind guard", () => {
  it("allows 127.0.0.1 with empty hash", () => {
    const c = defaultConfig();
    expect(() => assertBindAllowed(c)).not.toThrow();
  });

  it("refuses 0.0.0.0 with empty hash", () => {
    const c = defaultConfig();
    c.server.host = "0.0.0.0";
    expect(() => assertBindAllowed(c)).toThrowError(AppError);
  });

  it("allows 0.0.0.0 once a hash is set", () => {
    const c = defaultConfig();
    c.server.host = "0.0.0.0";
    c.server.passwordHash = "argon2$...";
    expect(() => assertBindAllowed(c)).not.toThrow();
  });

  it("bindBanner mentions LAN, password, terminal, HTTPS", () => {
    const c = defaultConfig();
    c.server.host = "0.0.0.0";
    const txt = bindBanner(c);
    expect(txt).toMatch(/LAN/i);
    expect(txt).toMatch(/password/i);
    expect(txt).toMatch(/terminal/i);
    expect(txt).toMatch(/HTTPS/i);
  });

  it("bindBanner returns empty for 127.0.0.1", () => {
    expect(bindBanner(defaultConfig())).toBe("");
  });
});
