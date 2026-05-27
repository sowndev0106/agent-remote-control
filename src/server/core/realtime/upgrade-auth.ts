// src/server/core/realtime/upgrade-auth.ts
import type { Socket } from "node:net";
import type { IncomingMessage } from "node:http";
import { SESSION_COOKIE } from "../app.js";

export function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}

export interface AuthenticateUpgradeOpts {
  cookieHeader: string;
  unsignCookie: (raw: string) => { valid: boolean; value: string | null };
  sessionsHas: (sessionId: string) => boolean;
  cookieName?: string;
}

export type UpgradeAuthResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: "no_cookie" | "bad_signature" | "unknown_session" };

export function authenticateUpgrade(opts: AuthenticateUpgradeOpts): UpgradeAuthResult {
  const name = opts.cookieName ?? SESSION_COOKIE;
  const cookies = parseCookies(opts.cookieHeader);
  const signed = cookies[name];
  if (!signed) return { ok: false, reason: "no_cookie" };
  const unsigned = opts.unsignCookie(signed);
  if (!unsigned.valid || !unsigned.value) {
    return { ok: false, reason: "bad_signature" };
  }
  if (!opts.sessionsHas(unsigned.value)) {
    return { ok: false, reason: "unknown_session" };
  }
  return { ok: true, sessionId: unsigned.value };
}

/**
 * Convenience helper: write a 401 and destroy the socket. Used by every WS
 * mount when authenticateUpgrade rejects.
 */
export function reject401(socket: Socket): void {
  socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
  socket.destroy();
}

export function reject404(socket: Socket): void {
  socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
  socket.destroy();
}

/** Tiny helper to read the cookie header off a raw upgrade request. */
export function cookieHeader(req: IncomingMessage): string {
  return req.headers.cookie ?? "";
}
