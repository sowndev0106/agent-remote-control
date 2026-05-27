import { describe, it, expect } from "vitest";
import { captureSnapshot, hashHtml } from "../src/server/adapters/antigravity/snapshot.js";
import type { CDPClient } from "../src/server/adapters/antigravity/cdp.js";

function mockCdp(returnValue: unknown): CDPClient {
  return {
    async call() {
      return { result: { value: JSON.stringify(returnValue) } } as never;
    },
    close() {},
    isOpen() { return true; },
    onEvent() { return () => {}; },
    onClose() { return () => {}; },
  };
}

describe("captureSnapshot", () => {
  it("returns sanitized HTML + hash on a successful capture", async () => {
    const cdp = mockCdp({
      ok: true,
      html: "<div>hi<script>x()</script></div>",
      text: "hi",
      title: "Antigravity",
    });
    const snap = await captureSnapshot(cdp);
    expect(snap.html).not.toMatch(/<script/i);
    expect(snap.html).toMatch(/<div/);
    expect(snap.text).toBe("hi");
    expect(snap.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("dedupe via hash: same HTML → same hash", () => {
    const a = hashHtml("<div>x</div>");
    const b = hashHtml("<div>x</div>");
    expect(a).toBe(b);
    expect(hashHtml("<div>y</div>")).not.toBe(a);
  });

  it("throws AppError(snapshot_stale) when capture script reports missing root", async () => {
    const cdp = mockCdp({ ok: false, reason: "workbench DOM root not found" });
    await expect(captureSnapshot(cdp)).rejects.toMatchObject({ code: "snapshot_stale" });
  });
});
