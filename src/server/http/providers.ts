import type { AppInstance } from "../core/app.js";
import { okEnvelope } from "../core/errors.js";
import { ProviderRegistry } from "../domains/providers.js";

interface Deps {
  providers: ProviderRegistry;
}

export function registerProviderRoutes(app: AppInstance, deps: Deps): void {
  app.get("/api/providers", async (_req, reply) => {
    reply.send(okEnvelope({ providers: deps.providers.getAll() }));
  });
}
