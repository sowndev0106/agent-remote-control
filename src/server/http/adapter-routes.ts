import type { AppInstance } from "../core/app.js";
import { AppError, errEnvelope, okEnvelope } from "../core/errors.js";
import type { AntigravityCdpAdapter } from "../adapters/antigravity/index.js";
import type { AgyAdapter } from "../adapters/agy/index.js";
import type { ProjectStore } from "../domains/projects.js";
import type { AgentSessionRegistry } from "../domains/agent-sessions.js";
import type { IProviderAdapter } from "../adapters/IProviderAdapter.js";
import type { ProviderId } from "../domains/types.js";
import type { SessionDiscoveryAggregator } from "../domains/discovery.js";
import { rejectIfMissing, requireBodyString } from "./route-helpers.js";

interface Deps {
  antigravity: AntigravityCdpAdapter;
  agy: AgyAdapter;
  projects: ProjectStore;
  sessions: AgentSessionRegistry;
  discovery: SessionDiscoveryAggregator;
}

function getAdapter(deps: Deps, providerId: ProviderId): IProviderAdapter {
  if (providerId === "antigravity") return deps.antigravity;
  if (providerId === "agy") return deps.agy;
  throw new AppError({
    code: "provider_disabled",
    operation: "select adapter",
    message: `Provider ${providerId} is not enabled in Phase 1.`,
    httpStatus: 409,
  });
}

export function registerAdapterRoutes(app: AppInstance, deps: Deps): void {
  app.post<{
    Querystring: { provider?: ProviderId };
    Body: { projectId?: string };
  }>("/api/sessions/discover", async (req, reply) => {
    const providerId = req.query.provider ?? "antigravity";
    // Validate provider is enabled (throws for disabled providers).
    getAdapter(deps, providerId);
    const projectId = req.body?.projectId;
    const projectPath = projectId
      ? deps.projects.get(projectId)?.path ?? ""
      : "";
    // Aggregate across CDP, tmux, screen, and unmanaged sources (REQ-104/105).
    const sessions = await deps.discovery.discover(projectPath);
    reply.send(okEnvelope({ sessions }));
  });

  app.post<{
    Body: { projectId?: string; providerId?: ProviderId };
  }>("/api/sessions/launch", async (req, reply) => {
    const providerId = req.body?.providerId ?? "antigravity";
    const adapter = getAdapter(deps, providerId);
    const projectId = requireBodyString(req.body, "projectId", "session.launch");
    const project = deps.projects.get(projectId);
    if (!project) {
      reply.code(404).send(
        errEnvelope(
          new AppError({
            code: "project_not_found",
            operation: "session.launch",
            message: "Unknown project.",
            httpStatus: 404,
          }),
        ),
      );
      return;
    }
    const session = await adapter.start(project.path);
    reply.send(okEnvelope({ session }));
  });

  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/attach",
    async (req, reply) => {
      const session = rejectIfMissing(deps.sessions, req.params.id, reply,
        `${req.method} ${req.url.split("?")[0]}`);
      if (!session) return;
      const adapter = getAdapter(deps, session.providerId);
      const updated = await adapter.attach(session);
      reply.send(okEnvelope({ session: updated }));
    },
  );

  app.post<{
    Params: { id: string };
    Body: { text?: string; conversationId?: string };
  }>("/api/sessions/:id/prompt", async (req, reply) => {
    const session = rejectIfMissing(deps.sessions, req.params.id, reply,
      `${req.method} ${req.url.split("?")[0]}`);
    if (!session) return;
    const text = requireBodyString(req.body, "text", "session.prompt");
    const adapter = getAdapter(deps, session.providerId);
    const ctx: { conversationId?: string } = {};
    if (typeof req.body?.conversationId === "string") {
      ctx.conversationId = req.body.conversationId;
    }
    await adapter.sendPrompt(session, text, ctx);
    reply.send(okEnvelope({ ok: true }));
  });

  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/stop",
    async (req, reply) => {
      const session = rejectIfMissing(deps.sessions, req.params.id, reply,
        `${req.method} ${req.url.split("?")[0]}`);
      if (!session) return;
      const adapter = getAdapter(deps, session.providerId);
      await adapter.stop(session);
      reply.send(okEnvelope({ ok: true }));
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/new-conversation",
    async (req, reply) => {
      const session = rejectIfMissing(deps.sessions, req.params.id, reply,
        `${req.method} ${req.url.split("?")[0]}`);
      if (!session) return;
      const adapter = getAdapter(deps, session.providerId);
      const actions = await adapter.getActions(session);
      const newChat = actions.find((a) =>
        /new\s*(chat|conversation)/i.test(a.label),
      );
      if (!newChat) {
        reply.code(409).send(
          errEnvelope(
            new AppError({
              code: "capability_unsupported",
              operation: "session.newConversation",
              message: "No 'New chat' control visible in the snapshot.",
            }),
          ),
        );
        return;
      }
      await adapter.performAction(session, newChat.actionId);
      reply.send(okEnvelope({ ok: true }));
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/snapshot",
    async (req, reply) => {
      const session = rejectIfMissing(deps.sessions, req.params.id, reply,
        `${req.method} ${req.url.split("?")[0]}`);
      if (!session) return;
      const adapter = getAdapter(deps, session.providerId);
      const snap = await adapter.getSnapshot(session);
      reply.send(okEnvelope({ snapshot: snap }));
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/actions",
    async (req, reply) => {
      const session = rejectIfMissing(deps.sessions, req.params.id, reply,
        `${req.method} ${req.url.split("?")[0]}`);
      if (!session) return;
      const adapter = getAdapter(deps, session.providerId);
      const actions = await adapter.getActions(session);
      reply.send(okEnvelope({ actions }));
    },
  );

  app.post<{ Params: { id: string; actionId: string } }>(
    "/api/sessions/:id/actions/:actionId",
    async (req, reply) => {
      const session = rejectIfMissing(deps.sessions, req.params.id, reply,
        `${req.method} ${req.url.split("?")[0]}`);
      if (!session) return;
      const adapter = getAdapter(deps, session.providerId);
      await adapter.performAction(session, req.params.actionId);
      reply.send(okEnvelope({ ok: true }));
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/conversations",
    async (req, reply) => {
      const session = rejectIfMissing(deps.sessions, req.params.id, reply,
        `${req.method} ${req.url.split("?")[0]}`);
      if (!session) return;
      const adapter = getAdapter(deps, session.providerId);
      const conversations = await adapter.listConversations(session);
      reply.send(okEnvelope({ conversations }));
    },
  );

  app.post<{ Params: { id: string; cid: string } }>(
    "/api/sessions/:id/conversations/:cid/select",
    async (req, reply) => {
      const session = rejectIfMissing(deps.sessions, req.params.id, reply,
        `${req.method} ${req.url.split("?")[0]}`);
      if (!session) return;
      const adapter = getAdapter(deps, session.providerId);
      await adapter.selectConversation(session, req.params.cid);
      reply.send(okEnvelope({ ok: true }));
    },
  );

  app.post<{
    Params: { id: string };
    Body: { fraction?: number };
  }>("/api/sessions/:id/scroll", async (req, reply) => {
    const session = rejectIfMissing(deps.sessions, req.params.id, reply,
      `${req.method} ${req.url.split("?")[0]}`);
    if (!session) return;
    if (session.providerId !== "antigravity") {
      reply.code(409).send(
        errEnvelope(
          new AppError({
            code: "capability_unsupported",
            operation: "session.scroll",
            message: "Scroll is only supported on the Antigravity CDP surface.",
          }),
        ),
      );
      return;
    }
    // REQ-044: scroll dispatch happens only on explicit UI scroll. The
    // request body's `fraction` is the only accepted input; the server picks
    // the actual CDP method. Full wheel-event dispatch lands once sprint 04
    // wires the user-driven scroll handler.
    reply.send(
      okEnvelope({ ok: true, note: "scroll relay scaffold" }),
    );
  });
}
