import type { AppInstance } from "../core/app.js";
import { okEnvelope } from "../core/errors.js";
import type { SessionStoreLite } from "../domains/sessions.js";

interface Deps {
  sessions: SessionStoreLite;
}

/**
 * Read-only baseline: `GET /api/sessions` lists everything the registry knows
 * about. The `POST /api/sessions/discover` route lives in adapter-routes.ts —
 * it must talk to an adapter, not the registry.
 */
export function registerSessionRoutes(app: AppInstance, deps: Deps): void {
  app.get("/api/sessions", async (_req, reply) => {
    reply.send(okEnvelope({ sessions: deps.sessions.list() }));
  });
}
