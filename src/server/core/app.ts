import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import { createLogger } from "./logger.js";
import type { AppConfig } from "./config.js";
import { SessionStore } from "./session.js";
import { AppError, errEnvelope } from "./errors.js";
import { CSRF_COOKIE, CSRF_HEADER, verifyCsrfToken } from "./csrf.js";

export interface BuildAppDeps {
  config: AppConfig;
  configPath: string;
  secret: Buffer;
  sessions: SessionStore;
}

export const SESSION_COOKIE = "arc_sid";

/**
 * Public route set — exempt from session+CSRF guards.
 * NFR-001 / H5 require everything else to authenticate.
 */
const PUBLIC_EXACT = new Set<string>([
  "/login",
  "/api/auth/login",
  "/healthz",
]);
const PUBLIC_PREFIXES = ["/login.", "/static/login/"];

function isPublic(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  if (PUBLIC_EXACT.has(path)) return true;
  for (const p of PUBLIC_PREFIXES) if (path.startsWith(p)) return true;
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

  return app;
}
