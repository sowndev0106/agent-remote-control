import { spawn } from "node:child_process";
import { loadConfig } from "../server/core/config.js";
import { configFile } from "./paths.js";

export async function runStatus(): Promise<void> {
  const cfg = await loadConfig(configFile());
  process.stdout.write(
    `bind:  http://${cfg.server.host}:${cfg.server.port}\n` +
      `config: ${configFile()}\n`,
  );
  await new Promise<void>((resolve) => {
    const p = spawn(
      "systemctl",
      ["--user", "status", "--no-pager", "agent-remote-control.service"],
      { stdio: "inherit" },
    );
    p.on("exit", () => resolve());
  });
}
