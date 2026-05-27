import type { AppInstance } from "../core/app.js";
import { okEnvelope } from "../core/errors.js";
import type { AppConfig } from "../core/config.js";

interface Deps {
  config: AppConfig;
}

/**
 * Sanitized config view. NEVER includes `server.passwordHash` (REQ-091/H14
 * spirit — secrets stay server-side). PUT is intentionally omitted in Phase 1;
 * config is edited via `agent-remote-control config --edit` + restart.
 */
export function registerConfigRoutes(app: AppInstance, deps: Deps): void {
  app.get("/api/config", async (_req, reply) => {
    const c = deps.config;
    reply.send(
      okEnvelope({
        server: {
          host: c.server.host,
          port: c.server.port,
          https: c.server.https,
          sessionIdleTimeoutMs: c.server.sessionIdleTimeoutMs,
          passwordSet: c.server.passwordHash.length > 0,
        },
        security: {
          passwordHashAlgorithm: c.security.passwordHashAlgorithm,
          loginRateLimit: c.security.loginRateLimit,
        },
        projects: c.projects,
        fileExplorer: c.fileExplorer,
        terminal: c.terminal,
        providers: {
          antigravity: {
            command: c.providers.antigravity.command,
            debugPortRange: c.providers.antigravity.debugPortRange,
            wrapperCommands: c.providers.antigravity.wrapperCommands,
            controlSurfaces: c.providers.antigravity.controlSurfaces,
            tmuxTargets: c.providers.antigravity.tmuxTargets,
            screenTargets: c.providers.antigravity.screenTargets,
            snapshotPollMs: c.providers.antigravity.snapshotPollMs,
          },
        },
      }),
    );
  });
}
