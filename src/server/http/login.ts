import type { FastifyReply } from "fastify";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../core/config.js";
import { AuthSessionStore } from "../core/auth-session.js";
import { verifyPassword } from "../core/auth.js";
import { AppError, errEnvelope, okEnvelope } from "../core/errors.js";
import { issueCsrfToken, CSRF_COOKIE } from "../core/csrf.js";
import { SESSION_COOKIE, type AppInstance } from "../core/app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Deps {
  config: AppConfig;
  sessions: AuthSessionStore;
}

interface RateRecord {
  failures: number;
  windowStart: number;
}
const ipBuckets = new Map<string, RateRecord>();

function rateCheck(ip: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const r = ipBuckets.get(ip);
  if (!r || now - r.windowStart > windowMs) {
    ipBuckets.set(ip, { failures: 0, windowStart: now });
    return true;
  }
  return r.failures < max;
}
function rateBump(ip: string): void {
  const r = ipBuckets.get(ip);
  if (r) r.failures += 1;
}
function rateReset(ip: string): void {
  ipBuckets.delete(ip);
}
export function _resetRateLimitForTests(): void {
  ipBuckets.clear();
}

function setSessionCookie(reply: FastifyReply, id: string, https: boolean): void {
  reply.setCookie(SESSION_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    signed: true,
  });
}
function setCsrfCookie(reply: FastifyReply, token: string, https: boolean): void {
  reply.setCookie(CSRF_COOKIE, token, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: https,
  });
}

async function loadLoginHtml(): Promise<string> {
  // Prefer the built SPA index when present; fall back to the bootstrap
  // static login (used by smoke tests and when the SPA is not built).
  const candidates = [
    // dist-web from `pnpm build:web`
    join(__dirname, "..", "..", "..", "dist-web", "index.html"),
    join(__dirname, "..", "..", "..", "..", "dist-web", "index.html"),
    // src/server/http/login.ts → src/web/login.html
    join(__dirname, "..", "..", "web", "login.html"),
    // dist/server/http/login.js → src/web/login.html (rooted at repo)
    join(__dirname, "..", "..", "..", "src", "web", "login.html"),
  ];
  for (const p of candidates) {
    try {
      return await readFile(p, "utf8");
    } catch {
      /* try next */
    }
  }
  throw new Error("login.html not found in any candidate location");
}

export function registerLoginRoutes(app: AppInstance, deps: Deps): void {
  app.get("/login", async (_req, reply) => {
    const html = await loadLoginHtml();
    reply.type("text/html").send(html);
  });

  app.post<{ Body: { password?: string } }>(
    "/api/auth/login",
    async (req, reply) => {
      const ip = req.ip;
      const { maxFailures, windowMs } = deps.config.security.loginRateLimit;
      if (!rateCheck(ip, maxFailures, windowMs)) {
        reply.code(429).send(
          errEnvelope(
            new AppError({
              code: "rate_limited",
              operation: "POST /api/auth/login",
              message: "Too many failed attempts. Try again later.",
              recoveryAction: `Wait ${Math.ceil(windowMs / 60000)} minutes.`,
            }),
          ),
        );
        return;
      }
      const pw = (req.body?.password ?? "").toString();
      const cfg = deps.config.server;
      if (!cfg.passwordHash) {
        reply.code(503).send(
          errEnvelope(
            new AppError({
              code: "not_configured",
              operation: "POST /api/auth/login",
              message: "Server has no password set.",
              recoveryAction: "Run `agent-remote-control install` first.",
            }),
          ),
        );
        return;
      }
      const ok = await verifyPassword(
        pw,
        cfg.passwordHash,
        deps.config.security.passwordHashAlgorithm,
      );
      if (!ok) {
        rateBump(ip);
        reply.code(401).send(
          errEnvelope(
            new AppError({
              code: "invalid_credentials",
              operation: "POST /api/auth/login",
              message: "Invalid password.",
              recoveryAction: "Try again or reset via the install command.",
            }),
          ),
        );
        return;
      }
      rateReset(ip);
      const session = await deps.sessions.create();
      setSessionCookie(reply, session.id, cfg.https);
      const csrf = issueCsrfToken();
      setCsrfCookie(reply, csrf, cfg.https);
      reply.send(okEnvelope({ ok: true }));
    },
  );

  app.post("/api/auth/logout", async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE];
    const unsigned = raw
      ? app.unsignCookie(raw)
      : ({ valid: false, value: null } as ReturnType<typeof app.unsignCookie>);
    if (unsigned.valid && unsigned.value) await deps.sessions.destroy(unsigned.value);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    reply.clearCookie(CSRF_COOKIE, { path: "/" });
    reply.send(okEnvelope({ ok: true }));
  });

  app.get("/api/auth/whoami", async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE];
    const unsigned = raw
      ? app.unsignCookie(raw)
      : ({ valid: false, value: null } as ReturnType<typeof app.unsignCookie>);
    if (!unsigned.valid || !unsigned.value) {
      reply.code(401).send(
        errEnvelope(
          new AppError({
            code: "auth_required",
            operation: "whoami",
            message: "Not signed in",
          }),
        ),
      );
      return;
    }
    reply.send(okEnvelope({ sessionId: unsigned.value }));
  });
}
