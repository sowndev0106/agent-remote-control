import type { AppInstance } from "../core/app.js";
import { okEnvelope } from "../core/errors.js";
import type { SessionStoreLite } from "../domains/sessions.js";

interface Deps {
  sessions: SessionStoreLite;
}

/**
 * Sprint 02 surface for sessions — read-only listing + empty discover.
 * Sprint 03 wires this up to real Antigravity sessions. Frontend can call
 * these endpoints today and get a stable, empty response.
 */
export function registerSessionRoutes(app: AppInstance, deps: Deps): void {
  app.get("/api/sessions", async (_req, reply) => {
    reply.send(okEnvelope({ sessions: deps.sessions.list() }));
  });

  app.post("/api/sessions/discover", async (_req, reply) => {
    reply.send(okEnvelope({ sessions: deps.sessions.list() }));
  });
}
