import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  allUnsupportedCapabilities,
  allUnknownCapabilities,
  type CapabilityKey,
  type CapabilityMap,
  type SlashCommandDescriptor,
} from "../../domains/types.js";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type ExecFn = (cmd: string, args: string[]) => Promise<ExecResult>;

export interface AgyDetectResult {
  available: boolean;
  capabilities: CapabilityMap;
  note?: string;
  version?: string;
  slashCommands: SlashCommandDescriptor[];
  errorCode?: "agy_not_installed";
}

const supportedKeys: CapabilityKey[] = [
  "launch",
  "attach",
  "stop",
  "sendPrompt",
  "sendInput",
  "listConversations",
  "selectConversation",
  "getSnapshot",
  "getStatus",
  "getActions",
  "performAction",
  "dispose",
];

export function agySupportedCapabilities(): CapabilityMap {
  const c = allUnknownCapabilities();
  for (const k of supportedKeys) c[k] = "supported";
  return c;
}

export function agyUnavailableCapabilities(): CapabilityMap {
  return allUnsupportedCapabilities();
}

export function parseAgyVersion(output: string): string | undefined {
  const m = output.match(/(\d+(?:\.\d+){1,3})/);
  return m?.[1];
}

export function parseAgyHelp(output: string): SlashCommandDescriptor[] {
  const seen = new Set<string>();
  const out: SlashCommandDescriptor[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/(?:^|\s)(\/[a-z][a-z0-9_-]*)\b/i);
    if (!m) continue;
    
    const command = m[1]!;
    const matchIndex = m.index ?? 0;
    const fullMatch = m[0];
    const offset = fullMatch.indexOf(command);
    const commandStart = matchIndex + offset;
    
    // If the matched command token is followed by a slash, it's a directory path (skip it)
    const nextChar = line[commandStart + command.length];
    if (nextChar === '/') continue;

    if (seen.has(command)) continue;
    seen.add(command);
    out.push({
      id: `agy.${command.slice(1).replaceAll("-", "_").toLowerCase()}`,
      label: command,
      command,
      enabled: true,
    });
  }
  return out;
}

export async function defaultExec(cmd: string, args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      encoding: "utf8",
      timeout: 5_000,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err && typeof err === "object" ? (err as Record<string, any>) : {};
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: typeof e.stdout === "string" ? e.stdout : "",
      stderr: typeof e.stderr === "string" ? e.stderr : "",
    };
  }
}

export async function detectAgy(args: {
  command: string;
  exec?: ExecFn;
}): Promise<AgyDetectResult> {
  const exec = args.exec ?? defaultExec;
  const versionOut = await exec(args.command, ["--version"]);
  if (versionOut.code !== 0) {
    return {
      available: false,
      capabilities: agyUnavailableCapabilities(),
      slashCommands: [],
      errorCode: "agy_not_installed",
      note: "`agy` was not found on PATH.",
    };
  }

  const helpOut = await exec(args.command, ["--help"]);
  const result: AgyDetectResult = {
    available: true,
    capabilities: agySupportedCapabilities(),
    slashCommands: parseAgyHelp(helpOut.stdout || helpOut.stderr),
    note: "`agy` CLI is available.",
  };
  const version = parseAgyVersion(versionOut.stdout || versionOut.stderr);
  if (version !== undefined) {
    result.version = version;
  }
  return result;
}
