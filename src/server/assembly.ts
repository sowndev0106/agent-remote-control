// src/server/assembly.ts
import { loadConfig, type AppConfig } from "./core/config.js";
import { ensureSecretKey } from "./core/secret-key.js";
import { AuthSessionStore } from "./core/auth-session.js";
import { buildApp, type AppInstance } from "./core/app.js";
import { registerLoginRoutes } from "./http/login.js";
import { registerDomainRoutes } from "./http/domain.js";
import { ProjectStore } from "./domains/projects.js";
import { ProviderRegistry } from "./domains/providers.js";
import { AgentSessionRegistry } from "./domains/agent-sessions.js";
import { RealtimeBus } from "./core/realtime/bus.js";
import { mountRealtimeWS } from "./core/realtime/ws.js";
import { mountTerminalWS } from "./core/realtime/terminal-ws.js";
import { AntigravityCdpAdapter } from "./adapters/antigravity/index.js";
import { AntigravityPtyAdapter } from "./adapters/antigravity/pty.js";
import { AntigravityWrapperAdapter } from "./adapters/antigravity/wrapper.js";
import { AntigravityTmuxAdapter } from "./adapters/antigravity/tmux.js";
import { AntigravityScreenAdapter } from "./adapters/antigravity/screen.js";
import { UnmanagedDetector } from "./adapters/antigravity/unmanaged.js";
import { AgyPtyAdapter } from "./adapters/agy/pty.js";
import { AgyWrapperAdapter } from "./adapters/agy/wrapper.js";
import type { PtyHandle, SpawnPtyOpts } from "./pty/pty.js";
import { SessionDiscoveryAggregator } from "./domains/discovery.js";
import { DebugPortPool, startIpcServer } from "./ipc/wire.js";
import type { IpcServer } from "./ipc/server.js";
import { TerminalService } from "./domains/terminal.js";
import { auditPermissions } from "./core/perms-audit.js";
import {
  configDir,
  configFile,
  projectsFile,
  secretFile,
  sessionsFile,
} from "../cli/paths.js";

export interface AssemblePaths {
  configFile: string;
  secretFile: string;
  sessionsFile: string;
  projectsFile: string;
}

export interface AssembleOverrides {
  /** Skip secret.key on disk and use this buffer instead (tests). */
  secret?: Buffer;
  /** Skip starting the IPC socket server (tests + smoke). */
  skipIpc?: boolean;
  /** Skip mounting the realtime + terminal WS upgrades (some unit tests). */
  skipWs?: boolean;
  /** Skip the startup permission audit (tests using mkdtemp dirs). */
  skipPermissionAudit?: boolean;
  /** Inject a fake PTY spawn for the agy adapter (tests). */
  agySpawn?: (opts: SpawnPtyOpts) => PtyHandle;
}

export interface AssembleOpts {
  config: AppConfig;
  paths?: AssemblePaths;
  overrides?: AssembleOverrides;
}

export interface AssembledDeps {
  config: AppConfig;
  cookieSessions: AuthSessionStore;
  projects: ProjectStore;
  providers: ProviderRegistry;
  agentSessions: AgentSessionRegistry;
  bus: RealtimeBus;
  antigravity: AntigravityCdpAdapter;
  pty: AntigravityPtyAdapter;
  wrapper: AntigravityWrapperAdapter;
  tmux: AntigravityTmuxAdapter;
  screen: AntigravityScreenAdapter;
  unmanaged: UnmanagedDetector;
  agy: AgyPtyAdapter;
  agyWrapper: AgyWrapperAdapter;
  discovery: SessionDiscoveryAggregator;
  terminal: TerminalService;
  portPool: DebugPortPool;
  ipc: IpcServer | null;
}

export interface AssembledServer {
  app: AppInstance;
  deps: AssembledDeps;
  shutdown: () => Promise<void>;
}

function defaultPaths(): AssemblePaths {
  return {
    configFile: configFile(),
    secretFile: secretFile(),
    sessionsFile: sessionsFile(),
    projectsFile: projectsFile(),
  };
}

export async function assembleServer(opts: AssembleOpts): Promise<AssembledServer> {
  const { config } = opts;
  const paths = opts.paths ?? defaultPaths();
  const overrides = opts.overrides ?? {};

  const secret = overrides.secret ?? (await ensureSecretKey(paths.secretFile));

  const cookieSessions = new AuthSessionStore({
    path: paths.sessionsFile,
    idleTimeoutMs: config.server.sessionIdleTimeoutMs,
  });
  await cookieSessions.load();

  const projects = new ProjectStore({
    path: paths.projectsFile,
    recentLimit: config.projects.recentLimit,
    configuredRoots: config.projects.roots,
  });
  await projects.load();

  const providers = new ProviderRegistry();
  const agentSessions = new AgentSessionRegistry();
  const bus = new RealtimeBus();
  const portPool = new DebugPortPool(config.providers.antigravity.debugPortRange);

  const antigravity = new AntigravityCdpAdapter({
    sessions: agentSessions,
    bus,
    command: config.providers.antigravity.command,
    debugPortRange: config.providers.antigravity.debugPortRange,
    launchTimeoutMs: config.providers.antigravity.launchTimeoutMs,
    snapshotPollMs: config.providers.antigravity.snapshotPollMs,
  });
  const pty = new AntigravityPtyAdapter({
    sessions: agentSessions,
    bus,
    command: config.providers.antigravity.command,
  });
  const wrapper = new AntigravityWrapperAdapter({ sessions: agentSessions, bus });
  const tmux = new AntigravityTmuxAdapter({
    sessions: agentSessions,
    targets: () => config.providers.antigravity.tmuxTargets,
  });
  const screen = new AntigravityScreenAdapter({
    sessions: agentSessions,
    targets: () => config.providers.antigravity.screenTargets,
  });
  const unmanaged = new UnmanagedDetector({
    sessions: agentSessions,
    ownedPids: () => new Set(),
    wrapperPids: () => new Set(),
    processName: config.providers.antigravity.command,
  });
  const agy = new AgyPtyAdapter({
    sessions: agentSessions,
    bus,
    command: config.providers.agy.command,
    scrollback: config.providers.agy.scrollback,
    conversationsDir: config.providers.agy.conversationsDir,
    ...(overrides.agySpawn ? { spawn: overrides.agySpawn } : {}),
  });
  const agyWrapper = new AgyWrapperAdapter({
    sessions: agentSessions,
    bus,
    scrollback: config.providers.agy.scrollback,
    conversationsDir: config.providers.agy.conversationsDir,
  });
  const discovery = new SessionDiscoveryAggregator([
    antigravity,
    tmux,
    screen,
    unmanaged,
  ]);
  const terminal = new TerminalService({
    enabled: config.terminal.enabled,
    shell: config.terminal.shell,
    maxTabs: config.terminal.maxTabs,
    scrollback: config.terminal.scrollback,
  });

  const app = await buildApp({
    config,
    configPath: paths.configFile,
    secret,
    sessions: cookieSessions,
  });
  registerLoginRoutes(app, { config, sessions: cookieSessions });
  registerDomainRoutes(app, {
    projects,
    providers,
    sessions: agentSessions,
    bus,
    antigravity,
    pty,
    agy,
    portPool,
    terminal,
    discovery,
    config,
  });

  if (!overrides.skipPermissionAudit) {
    await auditPermissions(
      { dir: configDir(), files: Object.values(paths) },
      app.log,
    );
  }
  if (!overrides.skipWs) {
    mountRealtimeWS({ app, bus, sessions: cookieSessions });
    mountTerminalWS({ app, sessions: cookieSessions, terminal });
  }

  let ipc: IpcServer | null = null;
  if (!overrides.skipIpc) {
    try {
      ipc = await startIpcServer({
        wrapper,
        agyWrapper,
        reservePort: async () => portPool.reserve(),
        releasePort: (p) => portPool.release(p),
      });
    } catch (err) {
      app.log.warn({ err }, "IPC server failed to start; wrapper CLI disabled");
    }
  }

  const deps: AssembledDeps = {
    config,
    cookieSessions,
    projects,
    providers,
    agentSessions,
    bus,
    antigravity,
    pty,
    wrapper,
    tmux,
    screen,
    unmanaged,
    agy,
    agyWrapper,
    discovery,
    terminal,
    portPool,
    ipc,
  };

  const shutdown = async (): Promise<void> => {
    terminal.shutdown();
    await pty.shutdown();
    await agy.shutdown();
    await antigravity.shutdown();
    if (ipc) await ipc.stop();
    await app.close();
  };

  return { app, deps, shutdown };
}
