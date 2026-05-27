import { WebSocketServer, type WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { AppInstance } from "../app.js";
import type { SessionStore } from "../session.js";
import type { TerminalService } from "../../domains/terminal.js";
import { SESSION_COOKIE } from "../app.js";

/**
 * Terminal WS bridge: `/api/terminal/tabs/:id/stream`.
 * AC-025: rejects unauthenticated upgrades. On connect, replays the RAM ring
 * buffer (recent output) then streams live PTY data; inbound frames are
 * written to the PTY stdin.
 */
export function mountTerminalWS(opts: {
  app: AppInstance;
  sessions: SessionStore;
  terminal: TerminalService;
}): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const re = /^\/api\/terminal\/tabs\/([^/]+)\/stream/;

  opts.app.server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    const m = re.exec(url);
    if (!m) return; // some other WS endpoint handles it

    const tabId = m[1]!;
    const cookies = parseCookies(req.headers.cookie ?? "");
    const signed = cookies[SESSION_COOKIE];
    const unsigned = signed
      ? opts.app.unsignCookie(signed)
      : { valid: false, value: null };
    if (!unsigned.valid || !unsigned.value || !opts.sessions.get(unsigned.value)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (!opts.terminal.get(tabId)) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req, tabId),
    );
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, tabId: string) => {
    // Replay buffered output so a reconnect shows recent context.
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
      // Plain bytes are PTY stdin. (Resize goes through the HTTP endpoint.)
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

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}
