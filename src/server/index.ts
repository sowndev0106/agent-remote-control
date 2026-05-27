import { configFile } from "../cli/paths.js";
import { loadConfig } from "./core/config.js";
import { tryBind } from "./core/port-check.js";
import { assertBindAllowed, bindBanner } from "./core/bind-guard.js";
import { assembleServer } from "./assembly.js";

export async function startServer(): Promise<void> {
  const configPath = configFile();
  const config = await loadConfig(configPath);
  assertBindAllowed(config);
  await tryBind(config.server.port, config.server.host);

  const banner = bindBanner(config);
  if (banner) process.stderr.write("\n" + banner + "\n\n");

  const assembled = await assembleServer({ config });

  await assembled.app.listen({
    host: config.server.host,
    port: config.server.port,
  });

  const shutdown = async (signal: string): Promise<void> => {
    assembled.app.log.info({ signal }, "shutting down");
    await assembled.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/dist/server/index.js")
) {
  startServer().catch((err) => {
    process.stderr.write(`startup failed: ${err.message ?? err}\n`);
    process.exit(1);
  });
}
