import { spawn } from "node:child_process";
import { loadConfig } from "../server/core/config.js";
import { configFile } from "./paths.js";

export async function runOpen(): Promise<void> {
  const cfg = await loadConfig(configFile());
  const host = cfg.server.host === "0.0.0.0" ? "127.0.0.1" : cfg.server.host;
  const url = `http://${host}:${cfg.server.port}`;
  process.stdout.write(`opening ${url}\n`);
  await new Promise<void>((resolve) => {
    const p = spawn("xdg-open", [url], { stdio: "inherit" });
    p.on("exit", () => resolve());
    p.on("error", () => resolve());
  });
}
