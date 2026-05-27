import { WebSocketServer, type WebSocket } from "ws";
import type { AppInstance } from "../app.js";
import type { RealtimeBus } from "./bus.js";
import type { SessionStore } from "../session.js";
import { SESSION_COOKIE } from "../app.js";

/**
 * Mount a WS endpoint on the Fastify HTTP server that authenticates each
 * upgrade via the `arc_sid` cookie and forwards bus events to every connected
 * client. NFR-001 / H5: realtime endpoints also require auth.
 */
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

    const cookieHeader = req.headers.cookie ?? "";
    const cookies = parseCookies(cookieHeader);
    const signed = cookies[SESSION_COOKIE];
    const unsigned = signed
      ? opts.app.unsignCookie(signed)
      : { valid: false, value: null };
    if (!unsigned.valid || !unsigned.value) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!opts.sessions.get(unsigned.value)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
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

  // Clean up when fastify closes.
  opts.app.addHook("onClose", async () => {
    unsubscribe();
    for (const c of clients) c.close();
    wss.close();
  });

  return wss;
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}
