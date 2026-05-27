import { spawn } from "node:child_process";
import { configFile } from "./paths.js";

export interface ConfigOpts {
  edit?: boolean;
  path?: boolean;
}

export async function runConfig(opts: ConfigOpts = {}): Promise<void> {
  const path = configFile();
  if (opts.path) {
    process.stdout.write(path + "\n");
    return;
  }
  if (opts.edit) {
    const editor = process.env["EDITOR"] ?? "nano";
    await new Promise<void>((resolve) => {
      const p = spawn(editor, [path], { stdio: "inherit" });
      p.on("exit", () => resolve());
    });
    return;
  }
  process.stdout.write(`config path: ${path}\n`);
}
