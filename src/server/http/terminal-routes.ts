import type { FastifyReply } from "fastify";
import type { AppInstance } from "../core/app.js";
import { okEnvelope, errEnvelope, AppError } from "../core/errors.js";
import type { TerminalService } from "../domains/terminal.js";
import type { ProjectStore } from "../domains/projects.js";

interface Deps {
  terminal: TerminalService;
  projects: ProjectStore;
}

function notFound(reply: FastifyReply, id: string): void {
  reply.code(404).send(
    errEnvelope(
      new AppError({
        code: "terminal_tab_not_found",
        operation: "terminal",
        message: `No terminal tab ${id}`,
        httpStatus: 404,
      }),
    ),
  );
}

export function registerTerminalRoutes(app: AppInstance, deps: Deps): void {
  app.get("/api/terminal/tabs", async (_req, reply) => {
    reply.send(okEnvelope({ tabs: deps.terminal.list() }));
  });

  app.post<{
    Body: { projectId?: string; cols?: number; rows?: number };
  }>("/api/terminal/tabs", async (req, reply) => {
    const projectId = req.body?.projectId;
    if (!projectId) {
      reply.code(400).send(
        errEnvelope(
          new AppError({
            code: "project_required",
            operation: "terminal.create",
            message: "Request body must include `projectId`.",
          }),
        ),
      );
      return;
    }
    const project = deps.projects.get(projectId);
    if (!project) {
      reply.code(404).send(
        errEnvelope(
          new AppError({
            code: "project_not_found",
            operation: "terminal.create",
            message: "Unknown project.",
            httpStatus: 404,
          }),
        ),
      );
      return;
    }
    const opts: { cols?: number; rows?: number } = {};
    if (typeof req.body?.cols === "number") opts.cols = req.body.cols;
    if (typeof req.body?.rows === "number") opts.rows = req.body.rows;
    const meta = deps.terminal.create(project.path, opts);
    reply.send(okEnvelope({ tab: meta }));
  });

  app.delete<{
    Params: { id: string };
    Querystring: { force?: string };
  }>("/api/terminal/tabs/:id", async (req, reply) => {
    const tab = deps.terminal.get(req.params.id);
    if (!tab) {
      notFound(reply, req.params.id);
      return;
    }
    const force = req.query.force === "true";
    if (!force && deps.terminal.hasForegroundJob(req.params.id)) {
      reply.code(409).send(
        errEnvelope(
          new AppError({
            code: "foreground_job_running",
            operation: "terminal.close",
            message: "A foreground process is running in this tab.",
            recoveryAction: "Re-send with ?force=true to close anyway.",
            httpStatus: 409,
          }),
        ),
      );
      return;
    }
    deps.terminal.close(req.params.id);
    reply.send(okEnvelope({ closed: true }));
  });

  app.post<{
    Params: { id: string };
    Body: { cols?: number; rows?: number };
  }>("/api/terminal/tabs/:id/resize", async (req, reply) => {
    const tab = deps.terminal.get(req.params.id);
    if (!tab) {
      notFound(reply, req.params.id);
      return;
    }
    const cols = Number(req.body?.cols ?? 80);
    const rows = Number(req.body?.rows ?? 24);
    deps.terminal.resize(req.params.id, cols, rows);
    reply.send(okEnvelope({ ok: true }));
  });
}
