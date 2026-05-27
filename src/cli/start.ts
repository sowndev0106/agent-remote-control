import { spawn } from "node:child_process";
import { startServer } from "../server/index.js";

export interface StartOpts {
  foreground?: boolean;
}

export async function runStart(opts: StartOpts = {}): Promise<void> {
  if (opts.foreground) {
    await startServer();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      "systemctl",
      ["--user", "start", "agent-remote-control.service"],
      { stdio: "inherit" },
    );
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`exited ${c}`))));
  });
}
