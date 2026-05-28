import type { AppInstance } from "../core/app.js";
import { okEnvelope, errEnvelope, AppError } from "../core/errors.js";
import type { TerminalService } from "../domains/terminal.js";
import type { ProjectStore } from "../domains/projects.js";
import { rejectIfMissingFrom, requireBodyString } from "./route-helpers.js";

interface Deps {
  terminal: TerminalService;
  projects: ProjectStore;
}

export function registerTerminalRoutes(app: AppInstance, deps: Deps): void {
  app.get("/api/terminal/tabs", async (_req, reply) => {
    reply.send(okEnvelope({ tabs: deps.terminal.list() }));
  });

  app.post<{
    Body: { projectId?: string; cols?: number; rows?: number };
  }>("/api/terminal/tabs", async (req, reply) => {
    const projectId = requireBodyString(req.body, "projectId", "terminal.create");
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
    const tab = rejectIfMissingFrom(
      deps.terminal,
      req.params.id,
      reply,
      new AppError({
        code: "terminal_tab_not_found",
        operation: "terminal",
        message: `No terminal tab ${req.params.id}`,
        httpStatus: 404,
      }),
    );
    if (!tab) return;
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
    const tab = rejectIfMissingFrom(
      deps.terminal,
      req.params.id,
      reply,
      new AppError({
        code: "terminal_tab_not_found",
        operation: "terminal",
        message: `No terminal tab ${req.params.id}`,
        httpStatus: 404,
      }),
    );
    if (!tab) return;
    const cols = Number(req.body?.cols ?? 80);
    const rows = Number(req.body?.rows ?? 24);
    deps.terminal.resize(req.params.id, cols, rows);
    reply.send(okEnvelope({ ok: true }));
  });
}
