import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "./logger.js";
import type { AppConfig } from "./config.js";
import { AuthSessionStore } from "./auth-session.js";
import { AppError, errEnvelope } from "./errors.js";
import { CSRF_COOKIE, CSRF_HEADER, verifyCsrfToken } from "./csrf.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface BuildAppDeps {
  config: AppConfig;
  configPath: string;
  secret: Buffer;
  sessions: AuthSessionStore;
}

export const SESSION_COOKIE = "arc_sid";

/**
 * Public route set — exempt from session+CSRF guards.
 * NFR-001 / H5 require everything else to authenticate.
 */
/**
 * Auth gate: every `/api/*` route requires a valid session except the login
 * endpoint itself. Static SPA shell routes are always public — the SPA owns
 * its own auth state and calls the same `/api/*` endpoints under the hood.
 *
 * H5 / NFR-001: ALL realtime endpoints also require auth (handled by the
 * cookie check in mountRealtimeWS — not via this hook).
 */
const PUBLIC_API_EXACT = new Set<string>(["/api/auth/login"]);

function isPublic(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  if (path === "/healthz") return true;
  // SPA shell + static assets are public; SPA enforces auth via API calls.
  if (!path.startsWith("/api/")) return true;
  if (PUBLIC_API_EXACT.has(path)) return true;
  return false;
}

export type AppInstance = Awaited<ReturnType<typeof buildApp>>;

export async function buildApp(deps: BuildAppDeps) {
  const silent = process.env["NODE_ENV"] === "test" || process.env["VITEST"];
  const app = Fastify({
    logger: silent ? false : createLogger(),
  });

  await app.register(fastifyCookie, {
    secret: deps.secret.toString("base64"),
    parseOptions: {},
  });

  // Strict app-shell security headers (NFR-002, S08-T10). The mirror iframe
  // uses srcdoc + sandbox="" with its own baseline; the shell CSP is never
  // relaxed. Tailwind compiles to classes so no 'unsafe-inline' is needed.
  app.addHook("onSend", async (req, reply, payload) => {
    const path = req.url.split("?")[0] ?? req.url;
    // Only set the HTML CSP on document responses, not JSON/assets.
    if (!path.startsWith("/api/")) {
      reply.header(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "connect-src 'self' ws: wss:",
          "frame-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; "),
      );
    }
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "SAMEORIGIN");
    reply.header("Referrer-Policy", "same-origin");
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      reply.code(err.httpStatus).send(errEnvelope(err));
      return;
    }
    req.log.error({ err }, "unhandled error");
    reply.code(500).send(
      errEnvelope(
        new AppError({
          code: "internal_error",
          operation: "request",
          message: "Internal Server Error",
        }),
      ),
    );
  });

  app.addHook("onRequest", async (req, reply) => {
    if (isPublic(req.url)) return;

    const raw = req.cookies[SESSION_COOKIE];
    const unsigned = raw
      ? app.unsignCookie(raw)
      : ({ valid: false, value: null } as ReturnType<typeof app.unsignCookie>);
    if (
      !unsigned.valid ||
      !unsigned.value ||
      !deps.sessions.get(unsigned.value)
    ) {
      reply.code(401).send(
        errEnvelope(
          new AppError({
            code: "auth_required",
            operation: `${req.method} ${req.url}`,
            message: "Authentication required.",
            recoveryAction: "Sign in at /login.",
            httpStatus: 401,
          }),
        ),
      );
      return;
    }
    await deps.sessions.touch(unsigned.value);

    const stateChanging = req.method !== "GET" && req.method !== "HEAD";
    if (stateChanging) {
      const cookieToken = req.cookies[CSRF_COOKIE];
      const headerToken = req.headers[CSRF_HEADER] as string | undefined;
      if (!verifyCsrfToken(cookieToken, headerToken)) {
        reply.code(403).send(
          errEnvelope(
            new AppError({
              code: "csrf_missing",
              operation: `${req.method} ${req.url}`,
              message: "CSRF token missing or invalid.",
              recoveryAction: "Reload the page to refresh CSRF state.",
              httpStatus: 403,
            }),
          ),
        );
        return;
      }
    }
  });

  app.get("/healthz", async () => ({
    ok: true,
    data: { status: "ok" },
    error: null,
  }));

  // Serve built SPA assets when `dist-web/` exists (`pnpm build:web`).
  const distWebCandidates = [
    resolve(__dirname, "..", "..", "..", "dist-web"),
    resolve(__dirname, "..", "..", "..", "..", "dist-web"),
  ];
  const distWeb = distWebCandidates.find((p) => existsSync(p));
  if (distWeb) {
    const assetsDir = join(distWeb, "assets");
    if (existsSync(assetsDir)) {
      await app.register(fastifyStatic, {
        root: assetsDir,
        prefix: "/assets/",
        decorateReply: false,
        wildcard: false,
        serve: true,
      });
    }
    const indexPath = join(distWeb, "index.html");
    if (existsSync(indexPath)) {
      const indexHtml = readFileSync(indexPath, "utf8");
      // Authenticated SPA fallback for any non-API GET.
      app.get("/", (_req, reply) => {
        reply.type("text/html").send(indexHtml);
      });
      app.get("/workspace/*", (_req, reply) => {
        reply.type("text/html").send(indexHtml);
      });
      app.get("/settings", (_req, reply) => {
        reply.type("text/html").send(indexHtml);
      });
    }
  }

  return app;
}
