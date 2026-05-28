import { Command } from "commander";
import { runInstall } from "./install.js";
import { runStart } from "./start.js";
import { runStop } from "./stop.js";
import { runStatus } from "./status.js";
import { runOpen } from "./open.js";
import { runConfig } from "./config.js";
import { runAntigravityWrapper } from "./antigravity.js";

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = new Command();
  program.name("agent-remote-control").version("0.1.0");

  program
    .command("install")
    .description("Set password, create config, install systemd --user service")
    .action(async () => {
      await runInstall();
    });

  program
    .command("start")
    .description(
      "Start the systemd --user service (or run server in foreground via --foreground)",
    )
    .option("--foreground", "Run server inline (for debugging)")
    .action(async (opts) => {
      await runStart(opts);
    });

  program
    .command("stop")
    .description("Stop the service")
    .action(async () => {
      await runStop();
    });

  program
    .command("status")
    .description("Print service status")
    .action(async () => {
      await runStatus();
    });

  program
    .command("open")
    .description("Open the web UI in default browser")
    .action(async () => {
      await runOpen();
    });

  program
    .command("config")
    .description("Print or edit the config file path")
    .option("--edit", "Open in $EDITOR")
    .option("--path", "Print just the path")
    .action(async (opts) => {
      await runConfig(opts);
    });

  // Wrapper commands: `agy <project>` and its `antigravity` alias.
  const wrap = (cmd: string) =>
    program
      .command(`${cmd} <project>`)
      .description(
        cmd === "agy"
          ? "Launch Antigravity for <project> and register it with the local server"
          : "Alias for `agy`",
      )
      .action(async (project: string) => {
        await runAntigravityWrapper({ project });
      });
  wrap("agy");
  wrap("antigravity");

  await program.parseAsync(argv);
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/dist/cli/index.js")
) {
  main().catch((err) => {
    process.stderr.write(`error: ${err.message ?? err}\n`);
    process.exit(1);
  });
}
