import { spawn } from "node:child_process";

export async function runStop(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      "systemctl",
      ["--user", "stop", "agent-remote-control.service"],
      { stdio: "inherit" },
    );
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`exited ${c}`))));
  });
}
