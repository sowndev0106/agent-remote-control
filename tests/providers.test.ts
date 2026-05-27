import { describe, it, expect } from "vitest";
import { ProviderRegistry } from "../src/server/domains/providers.js";

describe("ProviderRegistry", () => {
  it("lists Antigravity enabled and three stubs disabled", () => {
    const reg = new ProviderRegistry();
    const all = reg.getAll();
    const ids = all.map((p) => p.id).sort();
    expect(ids).toEqual(["antigravity", "claude", "codex", "opencode"]);

    const ag = reg.get("antigravity")!;
    expect(ag.enabled).toBe(true);
    expect(ag.status).toBe("unavailable");
    expect(ag.capabilities.launch).toBe("unknown");

    for (const id of ["claude", "codex", "opencode"] as const) {
      const p = reg.get(id)!;
      expect(p.enabled).toBe(false);
      expect(p.status).toBe("future");
      expect(p.capabilities.launch).toBe("unsupported");
      expect(p.capabilities.attach).toBe("unsupported");
    }
  });
});
