import { describe, it, expect } from "vitest";
import {
  UnmanagedDetector,
  type RawProcess,
} from "../src/server/adapters/antigravity/unmanaged.js";
import { SessionStoreLite } from "../src/server/domains/sessions.js";

function detector(
  procs: RawProcess[],
  owned: number[] = [],
  wrapper: number[] = [],
) {
  return new UnmanagedDetector({
    sessions: new SessionStoreLite(),
    ownedPids: () => new Set(owned),
    wrapperPids: () => new Set(wrapper),
    procScan: async () => procs,
  });
}

describe("UnmanagedDetector", () => {
  it("flags an external antigravity process not owned/wrapped (AC-030)", async () => {
    const det = detector([
      { pid: 1000, comm: "antigravity", cmdline: "antigravity /home/u/proj", cwd: "/home/u/proj" },
    ]);
    const found = await det.scan();
    expect(found.length).toBe(1);
    expect(found[0]!.source).toBe("unmanaged");
    expect(found[0]!.attachable).toBe(false);
    expect(found[0]!.guidance.recommendedCommand).toContain("/home/u/proj");
  });

  it("excludes app-owned PIDs", async () => {
    const det = detector(
      [{ pid: 2000, comm: "antigravity", cmdline: "antigravity" }],
      [2000],
    );
    expect(await det.scan()).toEqual([]);
  });

  it("excludes wrapper-registered PIDs", async () => {
    const det = detector(
      [{ pid: 3000, comm: "antigravity", cmdline: "antigravity" }],
      [],
      [3000],
    );
    expect(await det.scan()).toEqual([]);
  });

  it("ignores non-antigravity processes", async () => {
    const det = detector([{ pid: 4000, comm: "node", cmdline: "node server.js" }]);
    expect(await det.scan()).toEqual([]);
  });

  it("uses generic recommended command when cwd unknown", async () => {
    const det = detector([{ pid: 5000, comm: "antigravity", cmdline: "antigravity" }]);
    const found = await det.scan();
    expect(found[0]!.guidance.recommendedCommand).toContain("<project>");
    expect(found[0]!.projectPath).toBeUndefined();
  });
});
