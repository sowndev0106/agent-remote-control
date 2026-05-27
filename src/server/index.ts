import {
  configDir,
  configFile,
  projectsFile,
  secretFile,
  sessionsFile,
} from "../cli/paths.js";
import { loadConfig } from "./core/config.js";
import { auditPermissions } from "./core/perms-audit.js";
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
import { RealtimeBus } from "./core/realtime/bus.js";
import { mountRealtimeWS } from "./core/realtime/ws.js";
import { mountTerminalWS } from "./core/realtime/terminal-ws.js";
import { AntigravityCdpAdapter } from "./adapters/antigravity/index.js";
import { AntigravityPtyAdapter } from "./adapters/antigravity/pty.js";
import { AntigravityWrapperAdapter } from "./adapters/antigravity/wrapper.js";
import { AntigravityTmuxAdapter } from "./adapters/antigravity/tmux.js";
import { AntigravityScreenAdapter } from "./adapters/antigravity/screen.js";
import { UnmanagedDetector } from "./adapters/antigravity/unmanaged.js";
import { SessionDiscoveryAggregator } from "./domains/discovery.js";
import { DebugPortPool, startIpcServer } from "./ipc/wire.js";
import type { IpcServer } from "./ipc/server.js";
import { TerminalService } from "./domains/terminal.js";

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
  const bus = new RealtimeBus();
  const antigravity = new AntigravityCdpAdapter({
    sessions: sessionsLite,
    bus,
    command: config.providers.antigravity.command,
    debugPortRange: config.providers.antigravity.debugPortRange,
    launchTimeoutMs: config.providers.antigravity.launchTimeoutMs,
    snapshotPollMs: config.providers.antigravity.snapshotPollMs,
  });
  const pty = new AntigravityPtyAdapter({
    sessions: sessionsLite,
    bus,
    command: config.providers.antigravity.command,
  });
  const wrapper = new AntigravityWrapperAdapter({ sessions: sessionsLite, bus });
  const portPool = new DebugPortPool(config.providers.antigravity.debugPortRange);
  const terminal = new TerminalService({
    enabled: config.terminal.enabled,
    shell: config.terminal.shell,
    maxTabs: config.terminal.maxTabs,
    scrollback: config.terminal.scrollback,
  });
  const tmux = new AntigravityTmuxAdapter({
    sessions: sessionsLite,
    targets: () => config.providers.antigravity.tmuxTargets,
  });
  const screen = new AntigravityScreenAdapter({
    sessions: sessionsLite,
    targets: () => config.providers.antigravity.screenTargets,
  });
  // owned/wrapper PIDs derive from the live session registry (best-effort).
  const unmanaged = new UnmanagedDetector({
    sessions: sessionsLite,
    ownedPids: () => new Set(),
    wrapperPids: () => new Set(),
    processName: config.providers.antigravity.command,
  });
  const discovery = new SessionDiscoveryAggregator({
    cdp: antigravity,
    tmux,
    screen,
    unmanaged,
  });

  const app = await buildApp({ config, configPath, secret, sessions });
  registerLoginRoutes(app, { config, sessions });
  registerDomainRoutes(app, {
    projects,
    providers,
    sessions: sessionsLite,
    bus,
    antigravity,
    pty,
    portPool,
    terminal,
    discovery,
    config,
  });

  // Permission audit (S08-T07 / H13): fix 0700 dir + 0600 files in place.
  await auditPermissions(
    { dir: configDir(), files: [configFile(), secretFile(), sessionsFile(), projectsFile()] },
    app.log,
  );

  const banner = bindBanner(config);
  if (banner) process.stderr.write("\n" + banner + "\n\n");

  mountRealtimeWS({ app, bus, sessions });
  mountTerminalWS({ app, sessions, terminal });

  // IPC server for wrapper CLI (best-effort; failure must not block HTTP).
  let ipc: IpcServer | null = null;
  try {
    ipc = await startIpcServer({
      wrapper,
      reservePort: async () => portPool.reserve(),
      releasePort: (p) => portPool.release(p),
    });
  } catch (err) {
    app.log.warn({ err }, "IPC server failed to start; wrapper CLI disabled");
  }

  await app.listen({ host: config.server.host, port: config.server.port });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    // H15 / NFR-013A: only owned PTY children get SIGTERM. Wrapper sessions
    // (owned: false) are left untouched.
    terminal.shutdown();
    await pty.shutdown();
    await antigravity.shutdown();
    if (ipc) await ipc.stop();
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
