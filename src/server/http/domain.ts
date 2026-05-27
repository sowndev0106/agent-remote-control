import type { AppInstance } from "../core/app.js";
import type { AppConfig } from "../core/config.js";
import { ProjectStore } from "../domains/projects.js";
import { ProviderRegistry } from "../domains/providers.js";
import { SessionStoreLite } from "../domains/sessions.js";
import { AntigravityCdpAdapter } from "../adapters/antigravity/index.js";
import { RealtimeBus } from "../core/realtime/bus.js";
import { registerProjectRoutes } from "./projects.js";
import { registerProviderRoutes } from "./providers.js";
import { registerSessionRoutes } from "./sessions.js";
import { registerAdapterRoutes } from "./adapter-routes.js";

export interface DomainDeps {
  projects: ProjectStore;
  providers: ProviderRegistry;
  sessions: SessionStoreLite;
  bus: RealtimeBus;
  antigravity: AntigravityCdpAdapter;
  config: AppConfig;
}

export function registerDomainRoutes(app: AppInstance, deps: DomainDeps): void {
  registerProjectRoutes(app, {
    projects: deps.projects,
    configuredRoots: deps.config.projects.roots,
  });
  registerProviderRoutes(app, { providers: deps.providers });
  registerSessionRoutes(app, { sessions: deps.sessions });
  registerAdapterRoutes(app, {
    antigravity: deps.antigravity,
    projects: deps.projects,
    sessions: deps.sessions,
  });
}
