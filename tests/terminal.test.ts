import { describe, it, expect, afterEach } from "vitest";
import { TerminalService } from "../src/server/domains/terminal.js";
import { AppError } from "../src/server/core/errors.js";

let svc: TerminalService;
afterEach(async () => {
  svc?.shutdown();
  // Let node-pty finish tearing down its native handles before the worker
  // exits — avoids an intermittent Napi teardown abort.
  await new Promise((r) => setTimeout(r, 50));
});

function make(overrides: Partial<{ enabled: boolean; maxTabs: number }> = {}) {
  return new TerminalService({
    enabled: overrides.enabled ?? true,
    shell: "/bin/bash",
    maxTabs: overrides.maxTabs ?? 2,
    scrollback: 1000,
  });
}

describe("TerminalService", () => {
  it("creates a tab with the project cwd (AC-022)", async () => {
    svc = make();
    const meta = svc.create("/tmp");
    expect(meta.id).toMatch(/^[0-9a-f]{16}$/);
    expect(meta.projectPath).toBe("/tmp");
    expect(svc.list().length).toBe(1);
  });

  it("enforces maxTabs", () => {
    svc = make({ maxTabs: 1 });
    svc.create("/tmp");
    expect(() => svc.create("/tmp")).toThrowError(/limit reached/);
  });

  it("rejects all ops when disabled (REQ-069)", () => {
    svc = make({ enabled: false });
    expect(() => svc.create("/tmp")).toThrowError(AppError);
    expect(svc.enabled).toBe(false);
  });

  it("buffers output in a RAM ring and replays it", async () => {
    svc = make();
    const meta = svc.create("/tmp");
    svc.write(meta.id, "echo hi-ring\n");
    await new Promise((r) => setTimeout(r, 300));
    expect(svc.buffer(meta.id)).toContain("hi-ring");
  });

  it("close removes the tab", () => {
    svc = make();
    const meta = svc.create("/tmp");
    svc.close(meta.id);
    expect(svc.list().length).toBe(0);
  });

  it("resize updates tab metadata", () => {
    svc = make();
    const meta = svc.create("/tmp");
    svc.resize(meta.id, 120, 40);
    const found = svc.list().find((t) => t.id === meta.id)!;
    expect(found.cols).toBe(120);
    expect(found.rows).toBe(40);
  });
});
