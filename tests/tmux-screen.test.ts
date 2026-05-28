import { describe, it, expect } from "vitest";
import { AntigravityTmuxAdapter } from "../src/server/adapters/antigravity/tmux.js";
import { AntigravityScreenAdapter } from "../src/server/adapters/antigravity/screen.js";
import { AgentSessionRegistry } from "../src/server/domains/agent-sessions.js";
import type { ExecResult } from "../src/server/adapters/antigravity/mux-exec.js";

interface Call {
  bin: string;
  args: string[];
}

function recorder(responses: Record<string, ExecResult>) {
  const calls: Call[] = [];
  const exec = async (bin: string, args: string[]): Promise<ExecResult> => {
    calls.push({ bin, args });
    const key = `${bin} ${args.join(" ")}`;
    for (const k of Object.keys(responses)) {
      if (key.startsWith(k)) return responses[k]!;
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  return { calls, exec };
}

describe("AntigravityTmuxAdapter", () => {
  it("capabilities mark actions + conversation unsupported", () => {
    const c = AntigravityTmuxAdapter.capabilities();
    expect(c.getSnapshot).toBe("supported");
    expect(c.sendPrompt).toBe("supported");
    expect(c.getActions).toBe("unsupported");
    expect(c.listConversations).toBe("unsupported");
  });

  it("discovers only configured targets that exist", async () => {
    const { exec } = recorder({
      "tmux list-sessions": { code: 0, stdout: "work\nother\n", stderr: "" },
    });
    const sessions = new AgentSessionRegistry();
    const adapter = new AntigravityTmuxAdapter({
      sessions,
      targets: () => [
        { name: "work", project: "/p" },
        { name: "ghost" },
      ],
      exec,
      binaryCheck: async () => true,
    });
    const found = await adapter.listDiscoveredSessions();
    expect(found.length).toBe(1);
    expect(found[0]!.source).toBe("tmux");
    expect(found[0]!.projectPath).toBe("/p");
  });

  it("sendPrompt uses -l literal mode (injection-safe, S07-T09)", async () => {
    const { calls, exec } = recorder({});
    const adapter = new AntigravityTmuxAdapter({
      sessions: new AgentSessionRegistry(),
      targets: () => [{ name: "work" }],
      exec,
      binaryCheck: async () => true,
    });
    await adapter.sendPrompt("work", "rm -rf / ; echo $(whoami)");
    const sendKeys = calls.find((c) => c.args.includes("send-keys") && c.args.includes("-l"));
    expect(sendKeys).toBeDefined();
    // The dangerous text is a single argv element after -l, never a shell string.
    expect(sendKeys!.args[sendKeys!.args.length - 1]).toBe("rm -rf / ; echo $(whoami)");
    // Followed by an Enter keypress.
    expect(calls.some((c) => c.args.includes("Enter"))).toBe(true);
  });

  it("getSnapshot returns capture-pane text + hash", async () => {
    const { exec } = recorder({
      "tmux capture-pane": { code: 0, stdout: "pane contents", stderr: "" },
    });
    const adapter = new AntigravityTmuxAdapter({
      sessions: new AgentSessionRegistry(),
      targets: () => [{ name: "work" }],
      exec,
      binaryCheck: async () => true,
    });
    const snap = await adapter.getSnapshot("work");
    expect(snap.text).toBe("pane contents");
    expect(snap.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("missing configured target throws tmux_target_missing", async () => {
    const adapter = new AntigravityTmuxAdapter({
      sessions: new AgentSessionRegistry(),
      targets: () => [],
      exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    });
    await expect(adapter.getSnapshot("nope")).rejects.toMatchObject({
      code: "tmux_target_missing",
    });
  });

  it("stop sends Ctrl-C (C-c)", async () => {
    const { calls, exec } = recorder({});
    const adapter = new AntigravityTmuxAdapter({
      sessions: new AgentSessionRegistry(),
      targets: () => [{ name: "work" }],
      exec,
      binaryCheck: async () => true,
    });
    await adapter.stop("work");
    expect(calls.some((c) => c.args.includes("C-c"))).toBe(true);
  });
});

describe("AntigravityScreenAdapter", () => {
  it("sendPrompt uses stuff with text as single argv element", async () => {
    const { calls, exec } = recorder({});
    const adapter = new AntigravityScreenAdapter({
      sessions: new AgentSessionRegistry(),
      targets: () => [{ name: "agy" }],
      exec,
      binaryCheck: async () => true,
    });
    await adapter.sendPrompt("agy", "hello; rm -rf /");
    const stuff = calls.find((c) => c.args.includes("stuff"));
    expect(stuff).toBeDefined();
    expect(stuff!.args[stuff!.args.length - 1]).toBe("hello; rm -rf /\r");
  });

  it("capabilities match tmux profile", () => {
    const c = AntigravityScreenAdapter.capabilities();
    expect(c.sendPrompt).toBe("supported");
    expect(c.getActions).toBe("unsupported");
  });
});
