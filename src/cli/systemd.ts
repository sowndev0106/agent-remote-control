import { readFile, mkdir, writeFile, chmod } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { systemdUserDir } from "./paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface UnitVars {
  nodeBin: string;
  binPath: string;
  pathEnv: string;
  workDir: string;
}

const DEFAULT_TEMPLATE = `[Unit]
Description=agent-remote-control (local AI agent control UI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=\${NODE_BIN} \${BIN_PATH} start --foreground
Restart=on-failure
RestartSec=2
Environment=NODE_ENV=production
Environment=PATH=\${NODE_PATH_ENV}
WorkingDirectory=\${WORK_DIR}

[Install]
WantedBy=default.target
`;

export async function loadTemplate(): Promise<string> {
  const candidates = [
    resolve(__dirname, "..", "..", "systemd", "agent-remote-control.service.tmpl"),
    resolve(
      __dirname,
      "..",
      "..",
      "..",
      "systemd",
      "agent-remote-control.service.tmpl",
    ),
  ];
  for (const p of candidates) {
    try {
      return await readFile(p, "utf8");
    } catch {
      /* try next */
    }
  }
  return DEFAULT_TEMPLATE;
}

export function renderUnit(vars: UnitVars, template: string = DEFAULT_TEMPLATE): string {
  return template
    .replaceAll("${NODE_BIN}", vars.nodeBin)
    .replaceAll("${BIN_PATH}", vars.binPath)
    .replaceAll("${NODE_PATH_ENV}", vars.pathEnv)
    .replaceAll("${WORK_DIR}", vars.workDir);
}

export async function installUnit(vars: UnitVars): Promise<string> {
  const dir = systemdUserDir();
  await mkdir(dir, { recursive: true });
  const unit = renderUnit(vars, await loadTemplate());
  const path = join(dir, "agent-remote-control.service");
  await writeFile(path, unit, { mode: 0o644 });
  await chmod(path, 0o644);
  return path;
}
