import { describe, it, expect } from "vitest";
import { renderUnit } from "../src/cli/systemd.js";

describe("systemd template", () => {
  it("substitutes all variables", () => {
    const out = renderUnit({
      nodeBin: "/usr/bin/node",
      binPath: "/home/me/.local/share/agent-remote-control/bin/agent-remote-control",
      pathEnv: "/usr/bin:/usr/local/bin",
      workDir: "/home/me",
    });
    expect(out).toContain("ExecStart=/usr/bin/node /home/me/.local");
    expect(out).toContain("Environment=PATH=/usr/bin:/usr/local/bin");
    expect(out).toContain("WorkingDirectory=/home/me");
    expect(out).not.toContain("${");
  });

  it("includes [Install] WantedBy=default.target", () => {
    const out = renderUnit({
      nodeBin: "node",
      binPath: "/x",
      pathEnv: "/x",
      workDir: "/x",
    });
    expect(out).toMatch(/WantedBy=default\.target/);
  });
});
