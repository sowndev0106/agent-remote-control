import { describe, it, expect } from "vitest";
import { AppError, okEnvelope, errEnvelope } from "../src/server/core/errors.js";

describe("errors", () => {
  it("AppError carries normalized fields", () => {
    const e = new AppError({
      code: "port_busy",
      operation: "bind",
      message: "port in use",
      recoveryAction: "free the port",
    });
    expect(e.code).toBe("port_busy");
    expect(e.recoveryAction).toBe("free the port");
    expect(e.httpStatus).toBe(400);
  });

  it("okEnvelope wraps data", () => {
    expect(okEnvelope({ a: 1 })).toEqual({ ok: true, data: { a: 1 }, error: null });
  });

  it("errEnvelope normalizes AppError", () => {
    const env = errEnvelope(
      new AppError({
        code: "x",
        operation: "y",
        message: "z",
      }),
    );
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("x");
  });

  it("errEnvelope handles plain Error", () => {
    const env = errEnvelope(new Error("boom"));
    expect(env.error.code).toBe("internal_error");
    expect(env.error.message).toBe("boom");
  });
});
