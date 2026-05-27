// src/server/core/realtime/terminal-ws.ts
import { WebSocketServer, type WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { AppInstance } from "../app.js";
import type { AuthSessionStore } from "../auth-session.js";
import type { TerminalService } from "../../domains/terminal.js";
import {
  authenticateUpgrade,
  cookieHeader,
  reject401,
  reject404,
} from "./upgrade-auth.js";

export function mountTerminalWS(opts: {
  app: AppInstance;
  sessions: AuthSessionStore;
  terminal: TerminalService;
}): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const re = /^\/api\/terminal\/tabs\/([^/]+)\/stream/;

  opts.app.server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    const m = re.exec(url);
    if (!m) return;

    const tabId = m[1]!;
    const auth = authenticateUpgrade({
      cookieHeader: cookieHeader(req),
      unsignCookie: (raw) => opts.app.unsignCookie(raw),
      sessionsHas: (id) => !!opts.sessions.get(id),
    });
    if (!auth.ok) {
      reject401(socket);
      return;
    }
    if (!opts.terminal.get(tabId)) {
      reject404(socket);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req, tabId),
    );
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, tabId: string) => {
    const buffered = opts.terminal.buffer(tabId);
    if (buffered) ws.send(buffered);

    const offData = opts.terminal.onData(tabId, (chunk) => {
      if (ws.readyState === ws.OPEN) ws.send(chunk);
    });
    const offExit = opts.terminal.onExit(tabId, (info) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\n[process exited: ${info.exitCode}]\r\n`);
        ws.close();
      }
    });

    ws.on("message", (raw) => {
      try {
        opts.terminal.write(tabId, raw.toString("utf8"));
      } catch {
        /* tab gone */
      }
    });
    ws.on("close", () => {
      offData();
      offExit();
    });
  });

  opts.app.addHook("onClose", async () => {
    wss.close();
  });

  return wss;
}
