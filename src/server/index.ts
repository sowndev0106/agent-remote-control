import {
  configFile,
  projectsFile,
  secretFile,
  sessionsFile,
} from "../cli/paths.js";
import { loadConfig } from "./core/config.js";
import { ensureSecretKey } from "./core/secret-key.js";
import { SessionStore } from "./core/session.js";
import { buildApp } from "./core/app.js";
import { registerLoginRoutes } from "./http/login.js";
import { registerDomainRoutes } from "./http/domain.js";
import { ProjectStore } from "./domains/projects.js";
import { ProviderRegistry } from "./domains/providers.js";
import { SessionStoreLite } from "./domains/sessions.js";
import { tryBind } from "./core/port-check.js";
import { assertBindAllowed, bindBanner } from "./core/bind-guard.js";

export async function startServer(): Promise<void> {
  const configPath = configFile();
  const config = await loadConfig(configPath);
  assertBindAllowed(config);
  await tryBind(config.server.port, config.server.host);

  const secret = await ensureSecretKey(secretFile());
  const sessions = new SessionStore({
    path: sessionsFile(),
    idleTimeoutMs: config.server.sessionIdleTimeoutMs,
  });
  await sessions.load();

  const projects = new ProjectStore({
    path: projectsFile(),
    recentLimit: config.projects.recentLimit,
    configuredRoots: config.projects.roots,
  });
  await projects.load();
  const providers = new ProviderRegistry();
  const sessionsLite = new SessionStoreLite();

  const app = await buildApp({ config, configPath, secret, sessions });
  registerLoginRoutes(app, { config, sessions });
  registerDomainRoutes(app, {
    projects,
    providers,
    sessions: sessionsLite,
    config,
  });

  const banner = bindBanner(config);
  if (banner) process.stderr.write("\n" + banner + "\n\n");

  await app.listen({ host: config.server.host, port: config.server.port });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    await app.close();
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
