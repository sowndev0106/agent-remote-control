import { password as askPassword, confirm } from "@inquirer/prompts";
import { spawn } from "node:child_process";
import { hashPassword, pickAlgorithm } from "../server/core/auth.js";
import { loadConfig, saveConfig } from "../server/core/config.js";
import { ensureSecretKey } from "../server/core/secret-key.js";
import { configFile, secretFile } from "./paths.js";
import { installUnit } from "./systemd.js";

const MIN_LEN = 12;

async function promptForNewPassword(): Promise<string> {
  for (;;) {
    const a = await askPassword({
      message: `Set the app password (min ${MIN_LEN} chars):`,
      mask: true,
    });
    if (a.length < MIN_LEN) {
      process.stderr.write(`Password must be at least ${MIN_LEN} characters.\n`);
      continue;
    }
    const b = await askPassword({ message: "Confirm password:", mask: true });
    if (a !== b) {
      process.stderr.write("Passwords did not match. Try again.\n");
      continue;
    }
    return a;
  }
}

function runSystemctl(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("systemctl", ["--user", ...args], { stdio: "inherit" });
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`systemctl ${args.join(" ")} exited ${code}`)),
    );
  });
}

async function maybeEnableLinger(): Promise<void> {
  const sessionType = process.env["XDG_SESSION_TYPE"];
  const headless = sessionType !== "x11" && sessionType !== "wayland";
  if (!headless) return;
  const enable = await confirm({
    message:
      "Detected non-graphical session. Enable `loginctl enable-linger $USER` " +
      "so the service survives logout?",
    default: true,
  });
  if (!enable) {
    process.stdout.write(
      "Run `loginctl enable-linger $USER` manually if you want the service " +
        "to start at boot without graphical login.\n",
    );
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      "loginctl",
      ["enable-linger", process.env["USER"] ?? ""],
      { stdio: "inherit" },
    );
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`loginctl enable-linger exited ${code}`)),
    );
  });
}

export async function runInstall(): Promise<void> {
  process.stdout.write("agent-remote-control install\n");

  const cfgPath = configFile();
  const config = await loadConfig(cfgPath);

  let needPassword = !config.server.passwordHash;
  if (config.server.passwordHash) {
    const overwrite = await confirm({
      message: "A password is already set. Overwrite?",
      default: false,
    });
    needPassword = overwrite;
    if (!overwrite) process.stdout.write("Keeping existing password.\n");
  }
  if (needPassword) {
    const pw = await promptForNewPassword();
    const algo = await pickAlgorithm();
    const { hash, algorithm } = await hashPassword(pw, algo);
    config.server.passwordHash = hash;
    config.security.passwordHashAlgorithm = algorithm;
    await saveConfig(cfgPath, config);
    process.stdout.write(`Password hashed with ${algorithm}.\n`);
  }

  await ensureSecretKey(secretFile());

  const nodeBin = process.execPath;
  const binPath = process.argv[1] ?? "agent-remote-control";
  const pathEnv = process.env["PATH"] ?? "/usr/bin:/usr/local/bin";
  const workDir = process.env["HOME"] ?? "/tmp";
  const unitPath = await installUnit({ nodeBin, binPath, pathEnv, workDir });
  process.stdout.write(`Wrote systemd unit: ${unitPath}\n`);

  await runSystemctl(["daemon-reload"]);
  await runSystemctl(["enable", "--now", "agent-remote-control.service"]);

  await maybeEnableLinger();

  process.stdout.write(
    `\nDone. UI: http://${config.server.host}:${config.server.port}\n` +
      `Run \`agent-remote-control status\` to verify.\n`,
  );
}
