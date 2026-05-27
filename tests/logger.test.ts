import { describe, it, expect } from "vitest";
import { createLogger, REDACT_PATHS } from "../src/server/core/logger.js";

describe("logger", () => {
  it("includes the standard redact paths", () => {
    for (const p of [
      "password",
      "passwordHash",
      "secret",
      "cookie",
      "set-cookie",
      "authorization",
      "csrfToken",
    ]) {
      expect(REDACT_PATHS).toContain(p);
    }
  });

  it("returns a pino logger instance", () => {
    const log = createLogger({ env: "test" });
    expect(typeof log.info).toBe("function");
    expect(typeof log.error).toBe("function");
  });
});
