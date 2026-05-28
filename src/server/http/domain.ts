import type { AppInstance } from "../core/app.js";
import type { AppConfig } from "../core/config.js";
import { ProjectStore } from "../domains/projects.js";
import { ProviderRegistry } from "../domains/providers.js";
import { AgentSessionRegistry } from "../domains/agent-sessions.js";
import { AntigravityCdpAdapter } from "../adapters/antigravity/index.js";
import { AntigravityPtyAdapter } from "../adapters/antigravity/pty.js";
import { AgyPtyAdapter } from "../adapters/agy/pty.js";
import { RealtimeBus } from "../core/realtime/bus.js";
import { registerProjectRoutes } from "./projects.js";
import { registerProviderRoutes } from "./providers.js";
import { registerSessionRoutes } from "./sessions.js";
import { registerAdapterRoutes } from "./adapter-routes.js";
import { registerPtyRoutes } from "./pty-routes.js";
import { registerFilesRoutes } from "./files-routes.js";
import { registerTerminalRoutes } from "./terminal-routes.js";
import { registerConfigRoutes } from "./config-routes.js";
import type { DebugPortPool } from "../ipc/wire.js";
import type { TerminalService } from "../domains/terminal.js";
import type { SessionDiscoveryAggregator } from "../domains/discovery.js";

export interface DomainDeps {
  projects: ProjectStore;
  providers: ProviderRegistry;
  sessions: AgentSessionRegistry;
  bus: RealtimeBus;
  antigravity: AntigravityCdpAdapter;
  pty: AntigravityPtyAdapter;
  agy: AgyPtyAdapter;
  portPool: DebugPortPool;
  terminal: TerminalService;
  discovery: SessionDiscoveryAggregator;
  config: AppConfig;
}

export function registerDomainRoutes(app: AppInstance, deps: DomainDeps): void {
  registerProjectRoutes(app, {
    projects: deps.projects,
    configuredRoots: deps.config.projects.roots,
  });
  registerProviderRoutes(app, { providers: deps.providers });
  registerConfigRoutes(app, { config: deps.config });
  registerSessionRoutes(app, { sessions: deps.sessions });
  registerAdapterRoutes(app, {
    antigravity: deps.antigravity,
    agy: deps.agy,
    projects: deps.projects,
    sessions: deps.sessions,
    discovery: deps.discovery,
  });
  registerPtyRoutes(app, {
    pty: deps.pty,
    cdp: deps.antigravity,
    projects: deps.projects,
    sessions: deps.sessions,
    portPool: deps.portPool,
  });
  registerFilesRoutes(app, { projects: deps.projects, config: deps.config });
  registerTerminalRoutes(app, {
    terminal: deps.terminal,
    projects: deps.projects,
  });
}
