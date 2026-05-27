import type { FastifyReply } from "fastify";
import type { AppInstance } from "../core/app.js";
import { AppError, errEnvelope, okEnvelope } from "../core/errors.js";
import type { AntigravityPtyAdapter } from "../adapters/antigravity/pty.js";
import type { AntigravityCdpAdapter } from "../adapters/antigravity/index.js";
import type { ProjectStore } from "../domains/projects.js";
import type { SessionStoreLite } from "../domains/sessions.js";
import type { DebugPortPool } from "../ipc/wire.js";

interface Deps {
  pty: AntigravityPtyAdapter;
  cdp: AntigravityCdpAdapter;
  projects: ProjectStore;
  sessions: SessionStoreLite;
  portPool: DebugPortPool;
}

function notFound(reply: FastifyReply, id: string): void {
  reply.code(404).send(
    errEnvelope(
      new AppError({
        code: "session_not_found",
        operation: "session lookup",
        message: `No session with id ${id}`,
        httpStatus: 404,
      }),
    ),
  );
}

export function registerPtyRoutes(app: AppInstance, deps: Deps): void {
  app.post<{
    Body: { projectId?: string };
  }>("/api/sessions/pty/launch", async (req, reply) => {
    const projectId = req.body?.projectId;
    if (!projectId) {
      reply.code(400).send(
        errEnvelope(
          new AppError({
            code: "project_required",
            operation: "pty.launch",
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
            operation: "pty.launch",
            message: "Unknown project.",
            httpStatus: 404,
          }),
        ),
      );
      return;
    }
    const port = deps.portPool.reserve();
    try {
      const session = await deps.pty.launch(project.path, port);
      reply.send(okEnvelope({ session, debugPort: port }));
    } catch (err) {
      deps.portPool.release(port);
      throw err;
    }
  });

  app.post<{
    Params: { id: string };
    Body: { input?: string };
  }>("/api/sessions/:id/pty/input", async (req, reply) => {
    const session = deps.sessions.get(req.params.id);
    if (!session) {
      notFound(reply, req.params.id);
      return;
    }
    const input = req.body?.input;
    if (typeof input !== "string") {
      reply.code(400).send(
        errEnvelope(
          new AppError({
            code: "input_required",
            operation: "pty.input",
            message: "Request body must include `input` string.",
          }),
        ),
      );
      return;
    }
    deps.pty.sendInput(req.params.id, input);
    reply.send(okEnvelope({ ok: true }));
  });

  app.post<{
    Params: { id: string };
    Body: { signal?: NodeJS.Signals };
  }>("/api/sessions/:id/pty/signal", async (req, reply) => {
    const session = deps.sessions.get(req.params.id);
    if (!session) {
      notFound(reply, req.params.id);
      return;
    }
    const signal = (req.body?.signal ?? "SIGINT") as NodeJS.Signals;
    deps.pty.signal(req.params.id, signal);
    reply.send(okEnvelope({ ok: true }));
  });

  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/resume",
    async (req, reply) => {
      const session = deps.sessions.get(req.params.id);
      if (!session) {
        notFound(reply, req.params.id);
        return;
      }
      // Resume is per-source:
      //  - cdp / wrapper / managed-pty: re-attach via CDP if still reachable.
      //  - managed-pty: PTY child may have died; if so mark stopped.
      if (session.source === "managed-pty") {
        const alive = deps.pty.isAlive(req.params.id);
        if (!alive) {
          session.status = "stopped";
          deps.sessions.set(session);
          reply.code(410).send(
            errEnvelope(
              new AppError({
                code: "managed_pty_resume_failed",
                operation: "session.resume",
                message: "Managed PTY process is no longer running.",
                httpStatus: 410,
              }),
            ),
          );
          return;
        }
      }
      const updated = await deps.cdp.attach(session);
      reply.send(okEnvelope({ session: updated }));
    },
  );
}
