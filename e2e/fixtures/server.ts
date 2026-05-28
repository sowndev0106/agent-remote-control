import { execSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PASSWORD = "e2e-correct-horse-battery";

export interface RunningServer {
  baseURL: string;
  password: string;
  projectDir: string;
  configDir: string;
  stop: () => Promise<void>;
}

export async function startTestServer(): Promise<RunningServer> {
  execSync("pnpm build", { cwd: root, stdio: "inherit" });

  const configDir = await mkdtemp(join(tmpdir(), "arc-e2e-config-"));
  const appCfgDir = join(configDir, "agent-remote-control");
  await mkdir(appCfgDir, { recursive: true });

  const projectDir = await mkdtemp(join(tmpdir(), "arc-e2e-project-"));
  await writeFile(join(projectDir, "hello.txt"), "e2e file body\n");

  const { hashPassword } = await import(
    pathToFileURL(join(root, "dist/server/core/auth.js")).href
  );
  const { defaultConfig } = await import(
    pathToFileURL(join(root, "dist/server/core/config.js")).href
  );
  const { hash, algorithm } = await hashPassword(PASSWORD);
  const cfg = defaultConfig();
  cfg.server.host = "127.0.0.1";
  cfg.server.port = await freePort();
  cfg.server.passwordHash = hash;
  cfg.security.passwordHashAlgorithm = algorithm;
  cfg.projects.roots = [projectDir];
  cfg.terminal.enabled = true;
  // Point the agy provider at a local stub so e2e never invokes the real CLI.
  const agyStub = join(root, "e2e", "fixtures", "agy-stub.cjs");
  await chmod(agyStub, 0o755);
  cfg.providers.agy.command = agyStub;
  await writeFile(
    join(appCfgDir, "config.json"),
    JSON.stringify({ version: 1, data: cfg }, null, 2),
    { mode: 0o600 },
  );

  const env = { ...process.env, XDG_CONFIG_HOME: configDir, NODE_ENV: "production" };
  const proc: ChildProcess = spawn(
    process.execPath,
    [join(root, "dist/server/index.js")],
    { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  const stderr: string[] = [];
  proc.stderr?.on("data", (chunk) => stderr.push(chunk.toString("utf8")));

  const baseURL = `http://127.0.0.1:${cfg.server.port}`;
  await waitForHealth(baseURL, () => stderr.join(""));

  return {
    baseURL,
    password: PASSWORD,
    projectDir,
    configDir,
    stop: async () => {
      proc.kill("SIGTERM");
      await waitForExit(proc).catch(() => proc.kill("SIGKILL"));
      await rm(configDir, { recursive: true, force: true });
      await rm(projectDir, { recursive: true, force: true });
    },
  };
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  if (!address || typeof address === "string") throw new Error("could not allocate port");
  return address.port;
}

async function waitForHealth(
  baseURL: string,
  stderr: () => string,
  timeoutMs = 15_000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${baseURL}/healthz`);
      if (res.ok) return;
    } catch {
      /* server not up yet */
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`server did not become healthy\n${stderr()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function waitForExit(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
