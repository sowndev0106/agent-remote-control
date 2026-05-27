import { describe, it, expect } from "vitest";
import { createServer } from "node:net";
import { tryBind } from "../src/server/core/port-check.js";
import { AppError } from "../src/server/core/errors.js";

function listen(host: string): Promise<{ close: () => void; port: number }> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ close: () => srv.close(), port });
    });
  });
}

describe("tryBind", () => {
  it("returns ok when port is free", async () => {
    const { close, port } = await listen("127.0.0.1");
    close();
    await new Promise((r) => setTimeout(r, 50));
    await expect(tryBind(port, "127.0.0.1")).resolves.toBeUndefined();
  });

  it("throws AppError(port_busy) when port is taken", async () => {
    const { close, port } = await listen("127.0.0.1");
    try {
      const err = await tryBind(port, "127.0.0.1").catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe("port_busy");
      expect(err.httpStatus).toBe(503);
      expect(err.recoveryAction).toMatch(/server\.port|config\.json/);
    } finally {
      close();
    }
  });
});
