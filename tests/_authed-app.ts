// tests/_authed-app.ts — shared test helper (not a *.test.ts so vitest won't run it)
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { defaultConfig, type AppConfig } from "../src/server/core/config.js";
import { hashPassword } from "../src/server/core/auth.js";
import { assembleServer, type AssembledServer } from "../src/server/assembly.js";
import { SESSION_COOKIE } from "../src/server/core/app.js";
import { _resetRateLimitForTests } from "../src/server/http/login.js";

export interface AuthedAppFixture {
  assembled: AssembledServer;
  cookieHeader: string;
  csrfVal: string;
}

export async function authedApp(args: {
  dir: string;
  password?: string;
  configure?: (c: AppConfig) => void;
}): Promise<AuthedAppFixture> {
  _resetRateLimitForTests();
  const password = args.password ?? "correct-horse-battery";
  const config = defaultConfig();
  args.configure?.(config);
  const { hash, algorithm } = await hashPassword(password);
  config.server.passwordHash = hash;
  config.security.passwordHashAlgorithm = algorithm;

  const assembled = await assembleServer({
    config,
    paths: {
      configFile: join(args.dir, "config.json"),
      secretFile: join(args.dir, "secret.key"),
      sessionsFile: join(args.dir, "sessions.json"),
      projectsFile: join(args.dir, "projects.json"),
    },
    overrides: {
      secret: randomBytes(32),
      skipIpc: true,
      skipWs: true,
      skipPermissionAudit: true,
    },
  });
  await assembled.app.ready();

  const login = await assembled.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { password },
  });
  const setCookies = ([] as string[]).concat(login.headers["set-cookie"] as never);
  const sid = setCookies.find((c) => c.includes(SESSION_COOKIE))!.split(";")[0]!;
  const csrf = setCookies.find((c) => c.includes("arc_csrf"))!.split(";")[0]!;
  const csrfVal = csrf.split("=")[1]!;
  return { assembled, cookieHeader: `${sid}; ${csrf}`, csrfVal };
}
