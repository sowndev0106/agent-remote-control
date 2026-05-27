import { dirname } from "node:path";
import type { AppInstance } from "../core/app.js";
import { okEnvelope, errEnvelope, AppError } from "../core/errors.js";
import { ProjectStore } from "../domains/projects.js";
import { resolveSafe, expandHome, isReadableDir } from "../core/path-safety.js";
import type { ProviderId } from "../domains/types.js";

interface Deps {
  projects: ProjectStore;
  configuredRoots: string[];
}

export function registerProjectRoutes(app: AppInstance, deps: Deps): void {
  app.get<{ Querystring: { path?: string; showHidden?: string } }>(
    "/api/projects/browse",
    async (req, reply) => {
      const rawPath = req.query.path ?? "~";
      const showHidden = req.query.showHidden === "true";
      const canonical = await resolveSafe(rawPath, deps.configuredRoots, {
        operation: "browse",
      }).catch((err) => {
        if (err instanceof AppError) throw err;
        throw err;
      });
      if (!(await isReadableDir(canonical))) {
        reply.code(400).send(
          errEnvelope(
            new AppError({
              code: "not_a_directory",
              operation: "browse",
              message: `Not a readable directory: ${canonical}`,
            }),
          ),
        );
        return;
      }
      const entries = await ProjectStore.browseDir(canonical, showHidden);
      const parent = dirname(canonical);
      const expandedRoots = deps.configuredRoots.map((r) => expandHome(r));
      reply.send(
        okEnvelope({
          path: canonical,
          parent: parent === canonical ? null : parent,
          roots: expandedRoots,
          entries,
        }),
      );
    },
  );

  app.get("/api/projects/recent", async (_req, reply) => {
    reply.send(okEnvelope({ projects: deps.projects.recent() }));
  });

  app.get<{ Params: { id: string } }>(
    "/api/projects/:id",
    async (req, reply) => {
      const p = deps.projects.get(req.params.id);
      if (!p) {
        reply.code(404).send(
          errEnvelope(
            new AppError({
              code: "project_not_found",
              operation: "get project",
              message: "No project with that id",
              httpStatus: 404,
            }),
          ),
        );
        return;
      }
      reply.send(okEnvelope({ project: p }));
    },
  );

  app.post<{
    Body: { path?: string; confirmManual?: boolean };
  }>("/api/projects", async (req, reply) => {
    const input = req.body?.path;
    if (!input) {
      reply.code(400).send(
        errEnvelope(
          new AppError({
            code: "path_required",
            operation: "select project",
            message: "Request body must include `path`.",
          }),
        ),
      );
      return;
    }
    const p = await deps.projects.select(input, req.body?.confirmManual === true);
    reply.send(okEnvelope({ project: p }));
  });

  app.delete<{ Params: { id: string } }>(
    "/api/projects/:id",
    async (req, reply) => {
      const removed = await deps.projects.remove(req.params.id);
      if (!removed) {
        reply.code(404).send(
          errEnvelope(
            new AppError({
              code: "project_not_found",
              operation: "remove project",
              message: "No project with that id",
              httpStatus: 404,
            }),
          ),
        );
        return;
      }
      reply.send(okEnvelope({ removed: true }));
    },
  );

  app.put<{
    Params: { id: string };
    Body: { providerId?: ProviderId };
  }>("/api/projects/:id/last-provider", async (req, reply) => {
    const providerId = req.body?.providerId;
    if (!providerId) {
      reply.code(400).send(
        errEnvelope(
          new AppError({
            code: "provider_id_required",
            operation: "set last provider",
            message: "Request body must include `providerId`.",
          }),
        ),
      );
      return;
    }
    const p = await deps.projects.setLastProvider(req.params.id, providerId);
    reply.send(okEnvelope({ project: p }));
  });

  app.put<{
    Params: { id: string };
    Body: { sessionId?: string };
  }>("/api/projects/:id/last-session", async (req, reply) => {
    const sessionId = req.body?.sessionId;
    if (!sessionId) {
      reply.code(400).send(
        errEnvelope(
          new AppError({
            code: "session_id_required",
            operation: "set last session",
            message: "Request body must include `sessionId`.",
          }),
        ),
      );
      return;
    }
    const p = await deps.projects.setLastSession(req.params.id, sessionId);
    reply.send(okEnvelope({ project: p }));
  });
}
