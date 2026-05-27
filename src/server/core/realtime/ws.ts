// src/server/core/realtime/ws.ts
import { WebSocketServer, type WebSocket } from "ws";
import type { AppInstance } from "../app.js";
import type { RealtimeBus } from "./bus.js";
import type { SessionStore } from "../session.js";
import {
  authenticateUpgrade,
  cookieHeader,
  reject401,
} from "./upgrade-auth.js";

export function mountRealtimeWS(opts: {
  app: AppInstance;
  bus: RealtimeBus;
  sessions: SessionStore;
  path?: string;
}): WebSocketServer {
  const path = opts.path ?? "/api/realtime";
  const wss = new WebSocketServer({ noServer: true });

  opts.app.server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    if (!url.startsWith(path)) return;

    const auth = authenticateUpgrade({
      cookieHeader: cookieHeader(req),
      unsignCookie: (raw) => opts.app.unsignCookie(raw),
      sessionsHas: (id) => !!opts.sessions.get(id),
    });
    if (!auth.ok) {
      reject401(socket);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  const clients = new Set<WebSocket>();
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  const unsubscribe = opts.bus.subscribe((env) => {
    const json = JSON.stringify(env);
    for (const c of clients) {
      if (c.readyState === c.OPEN) c.send(json);
    }
  });

  opts.app.addHook("onClose", async () => {
    unsubscribe();
    for (const c of clients) c.close();
    wss.close();
  });

  return wss;
}
