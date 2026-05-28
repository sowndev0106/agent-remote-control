import { describe, expect, it, vi } from "vitest";
import {
  detectAgy,
  parseAgyHelp,
  parseAgyVersion,
} from "../src/server/adapters/agy/detect.js";

describe("agy detection", () => {
  it("parses loose version output", () => {
    expect(parseAgyVersion("agy version 0.4.1\n")).toBe("0.4.1");
    expect(parseAgyVersion("Antigravity CLI 2026.05.28")).toBe("2026.05.28");
    expect(parseAgyVersion("weird")).toBeUndefined();
  });

  it("parses slash commands from help output", () => {
    const out = parseAgyHelp(`
Commands:
  /help      Show help
  /resume   Resume a conversation
  /clear     Clear screen
`);
    expect(out.map((c) => c.command)).toEqual(["/help", "/resume", "/clear"]);
    expect(out[0]).toMatchObject({ id: "agy.help", label: "/help", enabled: true });
  });

  it("ignores absolute file paths in help output", () => {
    const out = parseAgyHelp(`
      Usage: /usr/local/bin/agy [options]
      --config FILE      Config file path (default: /etc/agy/config.toml)
      /help              Show help
    `);
    expect(out.map((c) => c.command)).toEqual(["/help"]);
  });

  it("reports unavailable when --version fails", async () => {
    const exec = vi.fn(async () => ({ code: 1, stdout: "", stderr: "" }));
    const result = await detectAgy({ command: "agy", exec });
    expect(result.available).toBe(false);
    expect(result.errorCode).toBe("agy_not_installed");
    expect(result.capabilities.launch).toBe("unsupported");
  });

  it("reports available with parsed version and commands", async () => {
    const exec = vi.fn(async (cmd: string, args: string[]) => {
      if (args.includes("--version")) return { code: 0, stdout: "agy 0.4.1\n", stderr: "" };
      if (args.includes("--help")) return { code: 0, stdout: "/help Help\n/resume Resume\n", stderr: "" };
      return { code: 1, stdout: "", stderr: "unexpected" };
    });
    const result = await detectAgy({ command: "agy", exec });
    expect(result.available).toBe(true);
    expect(result.version).toBe("0.4.1");
    expect(result.slashCommands.map((c) => c.command)).toEqual(["/help", "/resume"]);
    expect(result.capabilities.launch).toBe("supported");
  });
});
