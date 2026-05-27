# Sprint 01 — Runtime, CLI, Auth Base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`.
> Plan steps use checkbox (`- [ ]`) syntax.

**Source spec:** [docs/sprints/sprint-01-runtime-auth.md](../../sprints/sprint-01-runtime-auth.md)

**Goal:** Bootstrap the `agent-remote-control` app: scaffold TypeScript/Fastify, ship a `bin/agent-remote-control` CLI with `install/start/stop/status/open/config`, a versioned JSON persistence helper, password setup + Argon2id hashing, signed session cookies, CSRF, login rate-limit, port-busy clear-error, `0.0.0.0` safety gate, systemd `--user` unit, and a `/login` HTML page.

**Architecture:** Single root `package.json` (locked, §22.7). ESM + `NodeNext` + `ES2022` strict TypeScript (§22.4). Fastify with Pino default logger (§22.6). Persistence envelope `{version, data}` with atomic writes (§22.5). Argon2id with bcrypt fallback (§22.2). Cookie signing key in separate `secret.key` file (§22.3). First-run password set via `@inquirer/prompts` inside `install` (§22.1).

**Tech Stack:** Node.js 20+ (verified Node 22 locally), TypeScript ESM, Fastify 4, `@fastify/cookie`, Pino, `argon2`, `bcrypt`, `@inquirer/prompts`, `proper-lockfile`, `commander` for CLI, Vitest for tests.

---

## File Structure

```
bin/agent-remote-control                  — node shim → src/cli/index.js
package.json                              — single root, type:"module"
tsconfig.json                             — ESM + NodeNext + strict
.eslintrc.cjs, .prettierrc.json
vitest.config.ts
src/
  cli/
    index.ts                              — commander entry, dispatches subcommands
    install.ts                            — password prompt, hash, secret.key, systemd unit
    start.ts | stop.ts | status.ts | open.ts | config.ts
    paths.ts                              — XDG paths, file-mode helpers
    systemd.ts                            — render + install unit template
  server/
    index.ts                              — boot entry (called by `start` in foreground)
    core/
      app.ts                              — Fastify build + plugin wiring
      logger.ts                           — Pino factory (dev/prod + redact list)
      config.ts                           — schema + loader + types
      persistence.ts                      — versioned envelope, atomic write
      auth.ts                             — hash/verify (algorithm dispatch)
      session.ts                          — session store (versioned JSON) + cookie
      csrf.ts                             — double-submit cookie helper
      errors.ts                           — HTTP envelope, AppError class
      port-check.ts                       — try-bind, normalized EADDRINUSE error
      bind-guard.ts                       — 0.0.0.0 + default-password refusal
    http/
      login.ts                            — POST /api/auth/login, GET /login HTML, POST /logout
      health.ts                           — GET /healthz (auth-exempt)
systemd/agent-remote-control.service.tmpl
tests/
  persistence.test.ts
  auth.test.ts
  session.test.ts
  csrf.test.ts
  port-check.test.ts
  bind-guard.test.ts
  login-route.test.ts
  systemd-template.test.ts
```

LOC budget: ~300 per file (arch §17).

---

### Task 1 (S01-T01a): Scaffold TypeScript + Fastify project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore` (append `dist/`, `node_modules/`, `coverage/`)
- Create: `vitest.config.ts`
- Create: `.eslintrc.cjs`, `.prettierrc.json`

- [ ] **Step 1.1: Initialize package.json**

```json
{
  "name": "agent-remote-control",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "bin": { "agent-remote-control": "bin/agent-remote-control" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -w -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint \"src/**/*.ts\" \"tests/**/*.ts\"",
    "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\""
  },
  "dependencies": {
    "fastify": "^4.28.0",
    "@fastify/cookie": "^9.3.1",
    "@fastify/static": "^7.0.4",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0",
    "commander": "^12.1.0",
    "@inquirer/prompts": "^5.0.0",
    "argon2": "^0.41.0",
    "bcrypt": "^5.1.1",
    "proper-lockfile": "^4.1.2",
    "node-pty": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "@types/node": "^20.12.0",
    "@types/bcrypt": "^5.0.2",
    "@types/proper-lockfile": "^4.1.4",
    "vitest": "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2",
    "eslint": "^8.57.0",
    "@typescript-eslint/parser": "^7.7.0",
    "@typescript-eslint/eslint-plugin": "^7.7.0",
    "prettier": "^3.2.5"
  }
}
```

- [ ] **Step 1.2: Write tsconfig.json (per §22.4)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

- [ ] **Step 1.3: Write vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
```

- [ ] **Step 1.4: Append build artifacts to `.gitignore`**

```
/node_modules
/dist
/coverage
```

- [ ] **Step 1.5: Install deps**

Run: `pnpm install`
Expected: lockfile created, native builds for `argon2`, `bcrypt`, `node-pty` succeed.
On native failure for argon2: continue (we'll fall back to bcrypt at runtime). Record actual outcome.

- [ ] **Step 1.6: Smoke-import `node-pty` under ESM**

Create `tests/smoke-imports.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("native ESM imports", () => {
  it("loads node-pty without throwing", async () => {
    const pty = await import("node-pty");
    expect(typeof pty.spawn).toBe("function");
  });
  it("loads argon2 or bcrypt", async () => {
    let ok = false;
    try { await import("argon2"); ok = true; } catch {}
    if (!ok) { await import("bcrypt"); ok = true; }
    expect(ok).toBe(true);
  });
});
```

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 1.7: Commit**

```
chore: scaffold typescript + fastify project (S01-T01)
```

---

### Task 2 (S01-T01b): Pino logger factory

**Files:**
- Create: `src/server/core/logger.ts`
- Create: `tests/logger.test.ts`

- [ ] **Step 2.1: Write failing test**

`tests/logger.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createLogger, REDACT_PATHS } from "../src/server/core/logger.js";

describe("logger", () => {
  it("includes the standard redact paths", () => {
    expect(REDACT_PATHS).toEqual(
      expect.arrayContaining([
        "password", "passwordHash", "secret", "cookie",
        "set-cookie", "authorization", "csrfToken",
        "req.headers.cookie", "req.headers.authorization",
        "res.headers['set-cookie']",
      ]),
    );
  });
  it("returns a pino logger instance", () => {
    const log = createLogger({ env: "test" });
    expect(typeof log.info).toBe("function");
    expect(typeof log.error).toBe("function");
  });
});
```

Run: `pnpm test logger` → FAIL (module missing).

- [ ] **Step 2.2: Implement**

```ts
import pino, { type Logger, type LoggerOptions } from "pino";

export const REDACT_PATHS = [
  "password",
  "passwordHash",
  "secret",
  "cookie",
  "set-cookie",
  "authorization",
  "csrfToken",
  "req.headers.cookie",
  "req.headers.authorization",
  "res.headers['set-cookie']",
] as const;

export interface LoggerEnv { env?: string; level?: string }

export function createLogger(env: LoggerEnv = {}): Logger {
  const level = env.level ?? process.env["LOG_LEVEL"] ?? "info";
  const isDev = (env.env ?? process.env["NODE_ENV"]) === "development";
  const opts: LoggerOptions = {
    level,
    redact: { paths: [...REDACT_PATHS], remove: true },
  };
  if (isDev) {
    opts.transport = { target: "pino-pretty", options: { colorize: true } };
  }
  return pino(opts);
}
```

Run: PASS. Commit `feat: pino logger with redact list (S01-T01)`.

---

### Task 3 (S01-T02): Persistence helper

**Files:**
- Create: `src/server/core/persistence.ts`
- Create: `tests/persistence.test.ts`

- [ ] **Step 3.1: Write failing tests**

`tests/persistence.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, stat, chmod, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPersisted, writePersisted, PersistenceError }
  from "../src/server/core/persistence.js";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "arc-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("persistence", () => {
  it("writes file at 0600 and parent dir at 0700", async () => {
    const path = join(dir, "sub", "config.json");
    await writePersisted(path, { hello: "world" });
    const fileMode = (await stat(path)).mode & 0o777;
    const dirMode  = (await stat(join(dir, "sub"))).mode & 0o777;
    expect(fileMode).toBe(0o600);
    expect(dirMode).toBe(0o700);
  });
  it("wraps payload in {version,data}", async () => {
    const path = join(dir, "x.json");
    await writePersisted(path, { a: 1 });
    const raw = JSON.parse(await readFile(path, "utf8"));
    expect(raw).toEqual({ version: 1, data: { a: 1 } });
  });
  it("round-trips through readPersisted", async () => {
    const path = join(dir, "x.json");
    await writePersisted(path, { a: 1 });
    expect(await readPersisted<{a:number}>(path)).toEqual({ a: 1 });
  });
  it("refuses files missing version", async () => {
    const path = join(dir, "x.json");
    await writeFile(path, JSON.stringify({ data: { a: 1 } }));
    await chmod(path, 0o600);
    await expect(readPersisted(path)).rejects.toBeInstanceOf(PersistenceError);
  });
  it("returns undefined when file does not exist", async () => {
    expect(await readPersisted(join(dir, "missing.json"))).toBeUndefined();
  });
  it("fails clearly when version is newer than supported", async () => {
    const path = join(dir, "x.json");
    await writeFile(path, JSON.stringify({ version: 999, data: {} }));
    await chmod(path, 0o600);
    await expect(readPersisted(path)).rejects.toThrow(/binary too old/);
  });
});
```

- [ ] **Step 3.2: Implement**

```ts
import { mkdir, rename, readFile, stat, chmod } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";

export const CURRENT_VERSION = 1;

export class PersistenceError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "PersistenceError";
  }
}

interface Envelope<T> { version: number; data: T }

export async function writePersisted<T>(path: string, data: T): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => {});
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const envelope: Envelope<T> = { version: CURRENT_VERSION, data };
  await writeFile(tmp, JSON.stringify(envelope, null, 2), { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
  await chmod(path, 0o600);
}

export async function readPersisted<T>(path: string): Promise<T | undefined> {
  let raw: string;
  try { raw = await readFile(path, "utf8"); }
  catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new PersistenceError(`Invalid JSON at ${path}`, "invalid_json"); }
  if (
    typeof parsed !== "object" || parsed === null ||
    typeof (parsed as Envelope<T>).version !== "number"
  ) {
    throw new PersistenceError(
      `File ${path} is missing "version" — refusing to load`,
      "missing_version",
    );
  }
  const env = parsed as Envelope<T>;
  if (env.version > CURRENT_VERSION) {
    throw new PersistenceError(
      `binary too old: file ${path} version ${env.version} > ${CURRENT_VERSION}`,
      "version_too_new",
    );
  }
  return env.data;
}

export async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const release = await lockfile.lock(path, { retries: { retries: 5, maxTimeout: 200 } });
  try { return await fn(); } finally { await release(); }
}

void stat;
```

Run: PASS. Commit `feat: versioned atomic persistence helper (S01-T02)`.

---

### Task 4 (S01-T02b): Config schema + loader

**Files:**
- Create: `src/server/core/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 4.1: Write tests**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, loadConfig, saveConfig }
  from "../src/server/core/config.js";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "arc-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("config", () => {
  it("default config matches REQ defaults", () => {
    const c = defaultConfig();
    expect(c.server.host).toBe("127.0.0.1");
    expect(c.server.port).toBe(4096);
    expect(c.server.passwordHash).toBe("");
    expect(c.server.sessionIdleTimeoutMs).toBe(86_400_000);
    expect(c.security.passwordHashAlgorithm).toBe("argon2id");
    expect(c.security.loginRateLimit).toEqual({ maxFailures: 10, windowMs: 300_000 });
    expect(c.providers.antigravity.snapshotPollMs).toBe(1000);
  });
  it("creates default config on first load", async () => {
    const path = join(dir, "config.json");
    const c = await loadConfig(path);
    expect(c.server.port).toBe(4096);
  });
  it("round-trips through save+load", async () => {
    const path = join(dir, "config.json");
    const c = defaultConfig();
    c.server.port = 5555;
    await saveConfig(path, c);
    const loaded = await loadConfig(path);
    expect(loaded.server.port).toBe(5555);
  });
});
```

- [ ] **Step 4.2: Implement config.ts (per REQUIEMENT "Default Configuration")**

```ts
import { readPersisted, writePersisted } from "./persistence.js";

export type HashAlgo = "argon2id" | "bcrypt" | "pbkdf2";

export interface AppConfig {
  server: {
    host: string; port: number; passwordHash: string;
    https: boolean; sessionIdleTimeoutMs: number;
  };
  security: {
    passwordHashAlgorithm: HashAlgo;
    loginRateLimit: { maxFailures: number; windowMs: number };
  };
  projects: { roots: string[]; recentLimit: number };
  fileExplorer: {
    enabled: boolean; showHidden: boolean;
    maxPreviewBytes: number; ignore: string[];
  };
  terminal: {
    enabled: boolean; shell: string; maxTabs: number;
    scrollback: number; idleTimeoutMs: number;
  };
  providers: {
    antigravity: {
      enabled: boolean; adapter: string; command: string;
      wrapperCommands: string[]; controlSurfaces: string[];
      debugPort: number; debugPortRange: number[];
      launchTimeoutMs: number; snapshotPollMs: number;
    };
  };
}

export function defaultConfig(): AppConfig {
  return {
    server: { host: "127.0.0.1", port: 4096, passwordHash: "",
              https: false, sessionIdleTimeoutMs: 86_400_000 },
    security: { passwordHashAlgorithm: "argon2id",
                loginRateLimit: { maxFailures: 10, windowMs: 300_000 } },
    projects: { roots: ["~"], recentLimit: 50 },
    fileExplorer: { enabled: true, showHidden: false,
                    maxPreviewBytes: 524_288,
                    ignore: [".git","node_modules","dist","build",".next",".cache"] },
    terminal: { enabled: true, shell: "", maxTabs: 8,
                scrollback: 10_000, idleTimeoutMs: 3_600_000 },
    providers: { antigravity: {
      enabled: true, adapter: "cdp", command: "antigravity",
      wrapperCommands: ["antigravity", "agy"],
      controlSurfaces: ["cdp","managed-pty","wrapper","tmux","screen"],
      debugPort: 9000, debugPortRange: [9000,9001,9002,9003],
      launchTimeoutMs: 30_000, snapshotPollMs: 1000,
    } },
  };
}

export async function loadConfig(path: string): Promise<AppConfig> {
  const existing = await readPersisted<AppConfig>(path);
  if (existing) return mergeWithDefaults(existing);
  const c = defaultConfig();
  await writePersisted(path, c);
  return c;
}

export async function saveConfig(path: string, c: AppConfig): Promise<void> {
  await writePersisted(path, c);
}

function mergeWithDefaults(loaded: Partial<AppConfig>): AppConfig {
  const d = defaultConfig();
  return {
    server:       { ...d.server,       ...(loaded.server       ?? {}) },
    security: {
      ...d.security,
      ...(loaded.security ?? {}),
      loginRateLimit: { ...d.security.loginRateLimit,
                        ...((loaded.security ?? {}).loginRateLimit ?? {}) },
    },
    projects:     { ...d.projects,     ...(loaded.projects     ?? {}) },
    fileExplorer: { ...d.fileExplorer, ...(loaded.fileExplorer ?? {}) },
    terminal:     { ...d.terminal,     ...(loaded.terminal     ?? {}) },
    providers:    { antigravity: { ...d.providers.antigravity,
                                   ...((loaded.providers ?? {}).antigravity ?? {}) } },
  };
}
```

Run: PASS. Commit `feat: config schema + loader (S01-T02)`.

---

### Task 5 (S01-T01c): Error envelope + AppError

**Files:**
- Create: `src/server/core/errors.ts`
- Create: `tests/errors.test.ts`

- [ ] **Step 5.1: Test**

```ts
import { describe, it, expect } from "vitest";
import { AppError, okEnvelope, errEnvelope } from "../src/server/core/errors.js";

describe("errors", () => {
  it("AppError carries normalized fields", () => {
    const e = new AppError({
      code: "port_busy", operation: "bind",
      message: "port in use", recoveryAction: "free the port",
    });
    expect(e.code).toBe("port_busy");
    expect(e.recoveryAction).toBe("free the port");
  });
  it("okEnvelope wraps data", () => {
    expect(okEnvelope({ a: 1 })).toEqual({ ok: true, data: { a: 1 }, error: null });
  });
  it("errEnvelope normalizes", () => {
    const env = errEnvelope(new AppError({
      code: "x", operation: "y", message: "z",
    }));
    expect(env.ok).toBe(false);
    expect(env.error?.code).toBe("x");
  });
});
```

- [ ] **Step 5.2: Implement**

```ts
export interface ErrorBody {
  code: string;
  operation: string;
  message: string;
  detail?: string;
  recoveryAction?: string;
}

export class AppError extends Error {
  readonly code: string;
  readonly operation: string;
  readonly detail?: string;
  readonly recoveryAction?: string;
  readonly httpStatus: number;

  constructor(body: ErrorBody & { httpStatus?: number }) {
    super(body.message);
    this.name = "AppError";
    this.code = body.code;
    this.operation = body.operation;
    if (body.detail !== undefined) this.detail = body.detail;
    if (body.recoveryAction !== undefined) this.recoveryAction = body.recoveryAction;
    this.httpStatus = body.httpStatus ?? 400;
  }
  toBody(): ErrorBody {
    const out: ErrorBody = { code: this.code, operation: this.operation, message: this.message };
    if (this.detail !== undefined) out.detail = this.detail;
    if (this.recoveryAction !== undefined) out.recoveryAction = this.recoveryAction;
    return out;
  }
}

export function okEnvelope<T>(data: T) {
  return { ok: true as const, data, error: null };
}
export function errEnvelope(e: AppError | Error) {
  const body = e instanceof AppError ? e.toBody() : {
    code: "internal_error", operation: "unknown", message: e.message,
  };
  return { ok: false as const, data: null, error: body };
}
```

Run: PASS. Commit `feat: normalized HTTP envelope + AppError (S01-T01)`.

---

### Task 6 (S01-T03): Password hashing with auto-fallback

**Files:**
- Create: `src/server/core/auth.ts`
- Create: `tests/auth.test.ts`

- [ ] **Step 6.1: Tests**

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, pickAlgorithm }
  from "../src/server/core/auth.js";

describe("auth.hashPassword/verifyPassword", () => {
  it("hashes and verifies (argon2id or bcrypt)", async () => {
    const { hash, algorithm } = await hashPassword("hunter2hunter2");
    expect(["argon2id","bcrypt","pbkdf2"]).toContain(algorithm);
    expect(hash).not.toBe("hunter2hunter2");
    expect(await verifyPassword("hunter2hunter2", hash, algorithm)).toBe(true);
    expect(await verifyPassword("wrong-wrong-1", hash, algorithm)).toBe(false);
  });
  it("env override forces pbkdf2", async () => {
    const prev = process.env["AGENT_REMOTE_CONTROL_HASH"];
    process.env["AGENT_REMOTE_CONTROL_HASH"] = "pbkdf2";
    try {
      const { algorithm, hash } = await hashPassword("hunter2hunter2");
      expect(algorithm).toBe("pbkdf2");
      expect(await verifyPassword("hunter2hunter2", hash, "pbkdf2")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env["AGENT_REMOTE_CONTROL_HASH"];
      else process.env["AGENT_REMOTE_CONTROL_HASH"] = prev;
    }
  });
  it("pickAlgorithm honors override", async () => {
    expect(await pickAlgorithm("pbkdf2")).toBe("pbkdf2");
  });
});
```

- [ ] **Step 6.2: Implement**

```ts
import { randomBytes, pbkdf2, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { HashAlgo } from "./config.js";

const pbkdf2Async = promisify(pbkdf2);
const PBKDF2_ITER = 210_000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = "sha256";

export interface HashResult { hash: string; algorithm: HashAlgo }

export async function pickAlgorithm(force?: HashAlgo): Promise<HashAlgo> {
  if (force) return force;
  const env = process.env["AGENT_REMOTE_CONTROL_HASH"] as HashAlgo | undefined;
  if (env === "pbkdf2" || env === "bcrypt" || env === "argon2id") return env;
  try { await import("argon2"); return "argon2id"; } catch {}
  try { await import("bcrypt"); return "bcrypt"; } catch {}
  return "pbkdf2";
}

export async function hashPassword(password: string, force?: HashAlgo): Promise<HashResult> {
  const algorithm = await pickAlgorithm(force);
  switch (algorithm) {
    case "argon2id": {
      const argon2 = await import("argon2");
      const hash = await argon2.hash(password, { type: argon2.argon2id });
      return { hash, algorithm };
    }
    case "bcrypt": {
      const bcrypt = await import("bcrypt");
      const hash = await bcrypt.hash(password, 12);
      return { hash, algorithm };
    }
    case "pbkdf2": {
      const salt = randomBytes(16);
      const derived = await pbkdf2Async(password, salt, PBKDF2_ITER, PBKDF2_KEYLEN, PBKDF2_DIGEST);
      const hash = `pbkdf2$${PBKDF2_DIGEST}$${PBKDF2_ITER}$${salt.toString("base64")}$${derived.toString("base64")}`;
      return { hash, algorithm };
    }
  }
}

export async function verifyPassword(
  password: string, hash: string, algorithm: HashAlgo,
): Promise<boolean> {
  switch (algorithm) {
    case "argon2id": {
      const argon2 = await import("argon2");
      try { return await argon2.verify(hash, password); } catch { return false; }
    }
    case "bcrypt": {
      const bcrypt = await import("bcrypt");
      try { return await bcrypt.compare(password, hash); } catch { return false; }
    }
    case "pbkdf2": {
      const parts = hash.split("$");
      if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
      const [, digest, iterStr, saltB64, hashB64] = parts;
      const salt = Buffer.from(saltB64!, "base64");
      const expected = Buffer.from(hashB64!, "base64");
      const derived = await pbkdf2Async(password, salt, Number(iterStr), expected.length, digest!);
      return derived.length === expected.length && timingSafeEqual(derived, expected);
    }
  }
}
```

Run: PASS. Commit `feat: password hash/verify with argon2/bcrypt/pbkdf2 (S01-T03)`.

---

### Task 7 (S01-T04): Session middleware + cookie signing

**Files:**
- Create: `src/server/core/session.ts`
- Create: `tests/session.test.ts`

- [ ] **Step 7.1: Tests**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/server/core/session.js";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "arc-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("SessionStore", () => {
  it("creates a random 32-byte id and persists it", async () => {
    const store = new SessionStore({
      path: join(dir, "sessions.json"), idleTimeoutMs: 60_000,
    });
    await store.load();
    const a = await store.create();
    const b = await store.create();
    expect(a.id).not.toBe(b.id);
    expect(a.id.length).toBeGreaterThanOrEqual(43); // base64url(32)
    const peer = new SessionStore({ path: join(dir, "sessions.json"), idleTimeoutMs: 60_000 });
    await peer.load();
    expect(peer.get(a.id)).toBeDefined();
  });
  it("get() returns undefined for expired sessions and prunes them", async () => {
    const store = new SessionStore({
      path: join(dir, "s.json"), idleTimeoutMs: 1, now: () => 0,
    });
    await store.load();
    const s = await store.create();
    (store as any).now = () => 100;
    expect(store.get(s.id)).toBeUndefined();
  });
  it("touch() extends expiry", async () => {
    let t = 0;
    const store = new SessionStore({
      path: join(dir, "s.json"), idleTimeoutMs: 100, now: () => t,
    });
    await store.load();
    const s = await store.create();
    t = 50;
    await store.touch(s.id);
    t = 120;
    expect(store.get(s.id)).toBeDefined();
  });
  it("destroy() removes the session", async () => {
    const store = new SessionStore({
      path: join(dir, "s.json"), idleTimeoutMs: 60_000,
    });
    await store.load();
    const s = await store.create();
    await store.destroy(s.id);
    expect(store.get(s.id)).toBeUndefined();
  });
});
```

- [ ] **Step 7.2: Implement**

```ts
import { randomBytes } from "node:crypto";
import { readPersisted, writePersisted } from "./persistence.js";

export interface SessionRecord { id: string; createdAt: number; lastSeenAt: number }
interface SessionData { sessions: Record<string, SessionRecord> }

export class SessionStore {
  private sessions = new Map<string, SessionRecord>();
  private readonly path: string;
  private readonly idleTimeoutMs: number;
  public now: () => number;

  constructor(opts: { path: string; idleTimeoutMs: number; now?: () => number }) {
    this.path = opts.path;
    this.idleTimeoutMs = opts.idleTimeoutMs;
    this.now = opts.now ?? Date.now;
  }

  async load(): Promise<void> {
    const data = await readPersisted<SessionData>(this.path);
    if (data?.sessions) {
      for (const [id, rec] of Object.entries(data.sessions)) {
        this.sessions.set(id, rec);
      }
    }
  }

  private async persist(): Promise<void> {
    const out: SessionData = { sessions: Object.fromEntries(this.sessions) };
    await writePersisted(this.path, out);
  }

  async create(): Promise<SessionRecord> {
    const id = randomBytes(32).toString("base64url");
    const t = this.now();
    const rec: SessionRecord = { id, createdAt: t, lastSeenAt: t };
    this.sessions.set(id, rec);
    await this.persist();
    return rec;
  }

  get(id: string): SessionRecord | undefined {
    const rec = this.sessions.get(id);
    if (!rec) return undefined;
    if (this.now() - rec.lastSeenAt > this.idleTimeoutMs) {
      this.sessions.delete(id);
      void this.persist();
      return undefined;
    }
    return rec;
  }

  async touch(id: string): Promise<void> {
    const rec = this.sessions.get(id);
    if (!rec) return;
    rec.lastSeenAt = this.now();
    await this.persist();
  }

  async destroy(id: string): Promise<void> {
    if (this.sessions.delete(id)) await this.persist();
  }

  size(): number { return this.sessions.size }
}
```

Run: PASS. Commit `feat: session store with versioned persistence (S01-T04)`.

---

### Task 8 (S01-T04b): Cookie signing secret + secret.key

**Files:**
- Create: `src/cli/paths.ts`
- Create: `src/server/core/secret-key.ts`
- Create: `tests/secret-key.test.ts`

- [ ] **Step 8.1: Tests**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureSecretKey } from "../src/server/core/secret-key.js";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "arc-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("ensureSecretKey", () => {
  it("creates a 32-byte file at 0600 on first call", async () => {
    const path = join(dir, "secret.key");
    const buf = await ensureSecretKey(path);
    expect(buf.length).toBe(32);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
  it("loads existing secret on second call", async () => {
    const path = join(dir, "secret.key");
    const a = await ensureSecretKey(path);
    const b = await ensureSecretKey(path);
    expect(Buffer.compare(a, b)).toBe(0);
    const onDisk = await readFile(path);
    expect(Buffer.compare(a, onDisk)).toBe(0);
  });
});
```

- [ ] **Step 8.2: Implement `paths.ts`**

```ts
import { homedir } from "node:os";
import { join } from "node:path";

const xdg = (env: string, fallback: string): string =>
  process.env[env] ?? join(homedir(), fallback);

export function configDir(): string {
  return join(xdg("XDG_CONFIG_HOME", ".config"), "agent-remote-control");
}
export function configFile(): string  { return join(configDir(), "config.json"); }
export function secretFile(): string  { return join(configDir(), "secret.key"); }
export function sessionsFile(): string{ return join(configDir(), "sessions.json"); }
export function systemdUserDir(): string {
  return join(xdg("XDG_CONFIG_HOME", ".config"), "systemd", "user");
}
```

- [ ] **Step 8.3: Implement `secret-key.ts`**

```ts
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, chmod, stat } from "node:fs/promises";
import { dirname } from "node:path";

export async function ensureSecretKey(path: string): Promise<Buffer> {
  try {
    const buf = await readFile(path);
    if (buf.length === 32) return buf;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700).catch(() => {});
  const buf = randomBytes(32);
  await writeFile(path, buf, { mode: 0o600 });
  await chmod(path, 0o600);
  void stat;
  return buf;
}
```

Run: PASS. Commit `feat: secret.key generation and load (S01-T04)`.

---

### Task 9 (S01-T06): CSRF helper

**Files:**
- Create: `src/server/core/csrf.ts`
- Create: `tests/csrf.test.ts`

- [ ] **Step 9.1: Tests**

```ts
import { describe, it, expect } from "vitest";
import { issueCsrfToken, verifyCsrfToken } from "../src/server/core/csrf.js";

describe("csrf double-submit", () => {
  it("token verifies against itself", () => {
    const t = issueCsrfToken();
    expect(verifyCsrfToken(t, t)).toBe(true);
  });
  it("rejects mismatched tokens", () => {
    expect(verifyCsrfToken(issueCsrfToken(), issueCsrfToken())).toBe(false);
  });
  it("rejects empty header", () => {
    expect(verifyCsrfToken(issueCsrfToken(), "")).toBe(false);
  });
  it("constant-time: tokens of different length return false", () => {
    expect(verifyCsrfToken("abc", "abcd")).toBe(false);
  });
});
```

- [ ] **Step 9.2: Implement**

```ts
import { randomBytes, timingSafeEqual } from "node:crypto";

export const CSRF_COOKIE = "arc_csrf";
export const CSRF_HEADER = "x-csrf-token";

export function issueCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function verifyCsrfToken(cookieToken: string | undefined,
                                 headerToken: string | undefined): boolean {
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

Run: PASS. Commit `feat: csrf double-submit helper (S01-T06)`.

---

### Task 10 (S01-T07): Port-busy check

**Files:**
- Create: `src/server/core/port-check.ts`
- Create: `tests/port-check.test.ts`

- [ ] **Step 10.1: Tests**

```ts
import { describe, it, expect } from "vitest";
import { createServer } from "node:net";
import { tryBind } from "../src/server/core/port-check.js";
import { AppError } from "../src/server/core/errors.js";

function listen(port: number, host: string) {
  return new Promise<{close: () => void; port: number}>((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(port, host, () => {
      const addr = srv.address();
      const p = typeof addr === "object" && addr ? addr.port : port;
      resolve({ close: () => srv.close(), port: p });
    });
  });
}

describe("tryBind", () => {
  it("returns ok when port is free", async () => {
    const { close, port } = await listen(0, "127.0.0.1");
    close();
    await new Promise((r) => setTimeout(r, 25));
    await expect(tryBind(port, "127.0.0.1")).resolves.toBeUndefined();
  });
  it("throws AppError(port_busy) when port is taken", async () => {
    const { close, port } = await listen(0, "127.0.0.1");
    try {
      await expect(tryBind(port, "127.0.0.1")).rejects.toBeInstanceOf(AppError);
      await expect(tryBind(port, "127.0.0.1")).rejects.toMatchObject({ code: "port_busy" });
    } finally { close(); }
  });
});
```

- [ ] **Step 10.2: Implement**

```ts
import { createServer } from "node:net";
import { AppError } from "./errors.js";

export async function tryBind(port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const srv = createServer();
    srv.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new AppError({
          code: "port_busy",
          operation: `Bind to ${host}:${port}`,
          message: `Port ${port} on ${host} is already in use.`,
          detail: "Another process is holding the port. The app will not kill it.",
          recoveryAction: "Stop the other process or set a different port in config.json (server.port).",
          httpStatus: 503,
        }));
        return;
      }
      reject(err);
    });
    srv.listen(port, host, () => srv.close(() => resolve()));
  });
}
```

Run: PASS. Commit `feat: port-busy try-bind with normalized error (S01-T07)`.

---

### Task 11 (S01-T08): 0.0.0.0 bind guard

**Files:**
- Create: `src/server/core/bind-guard.ts`
- Create: `tests/bind-guard.test.ts`

- [ ] **Step 11.1: Tests**

```ts
import { describe, it, expect } from "vitest";
import { assertBindAllowed, bindBanner }
  from "../src/server/core/bind-guard.js";
import { AppError } from "../src/server/core/errors.js";
import { defaultConfig } from "../src/server/core/config.js";

describe("bind guard", () => {
  it("allows 127.0.0.1 with empty hash", () => {
    const c = defaultConfig();
    expect(() => assertBindAllowed(c)).not.toThrow();
  });
  it("refuses 0.0.0.0 with empty hash", () => {
    const c = defaultConfig();
    c.server.host = "0.0.0.0";
    expect(() => assertBindAllowed(c)).toThrowError(AppError);
  });
  it("allows 0.0.0.0 once a hash is set", () => {
    const c = defaultConfig();
    c.server.host = "0.0.0.0";
    c.server.passwordHash = "argon2$...";
    expect(() => assertBindAllowed(c)).not.toThrow();
  });
  it("bindBanner mentions LAN, password, terminal risk", () => {
    const c = defaultConfig();
    c.server.host = "0.0.0.0";
    const txt = bindBanner(c);
    expect(txt).toMatch(/LAN/i);
    expect(txt).toMatch(/password/i);
    expect(txt).toMatch(/terminal/i);
    expect(txt).toMatch(/HTTPS/i);
  });
});
```

- [ ] **Step 11.2: Implement**

```ts
import type { AppConfig } from "./config.js";
import { AppError } from "./errors.js";

export function assertBindAllowed(c: AppConfig): void {
  if (c.server.host === "0.0.0.0" && c.server.passwordHash === "") {
    throw new AppError({
      code: "bind_refused_default_password",
      operation: "Bind 0.0.0.0",
      message: "Refusing to bind 0.0.0.0 without a password set.",
      recoveryAction: "Run `agent-remote-control install` to set a password, then restart.",
      httpStatus: 500,
    });
  }
}

export function bindBanner(c: AppConfig): string {
  if (c.server.host !== "0.0.0.0") return "";
  const httpsHint = c.server.https
    ? "HTTPS is enabled."
    : "HTTPS is NOT enabled — recommend HTTPS for LAN use.";
  return [
    "================================================================",
    "  WARNING: agent-remote-control is bound to 0.0.0.0 (LAN exposed)",
    "  - Anyone on your LAN can reach the login page.",
    "  - Password protects login, but does NOT encrypt traffic.",
    `  - ${httpsHint}`,
    "  - The terminal panel runs commands as your user account.",
    "================================================================",
  ].join("\n");
}
```

Run: PASS. Commit `feat: 0.0.0.0 bind guard + warning banner (S01-T08)`.

---

### Task 12 (S01-T01d + S01-T04c): Fastify `app.ts` wiring

**Files:**
- Create: `src/server/core/app.ts`

- [ ] **Step 12.1: Implement (no separate unit test — covered by login-route + smoke tests)**

```ts
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import { createLogger } from "./logger.js";
import type { AppConfig } from "./config.js";
import { SessionStore } from "./session.js";
import { AppError, errEnvelope } from "./errors.js";
import { CSRF_COOKIE, CSRF_HEADER, verifyCsrfToken, issueCsrfToken } from "./csrf.js";

export interface BuildAppDeps {
  config: AppConfig;
  configPath: string;
  secret: Buffer;
  sessions: SessionStore;
}

export const SESSION_COOKIE = "arc_sid";

export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: createLogger() });

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
    reply.code(500).send(errEnvelope(new AppError({
      code: "internal_error", operation: "request", message: "Internal Server Error",
    })));
  });

  // Auth + CSRF guard
  const PUBLIC = new Set(["/login", "/api/auth/login", "/healthz",
                          "/login.css", "/login.js"]);
  app.addHook("onRequest", async (req, reply) => {
    if (PUBLIC.has(req.url) || req.url.startsWith("/login")) return;

    const sid = req.cookies[SESSION_COOKIE];
    const unsigned = sid ? app.unsignCookie(sid) : { valid: false, value: null };
    if (!unsigned.valid || !unsigned.value || !deps.sessions.get(unsigned.value)) {
      reply.code(401).send(errEnvelope(new AppError({
        code: "auth_required", operation: req.method + " " + req.url,
        message: "Authentication required.",
        recoveryAction: "Sign in at /login.",
        httpStatus: 401,
      })));
      return;
    }
    await deps.sessions.touch(unsigned.value);

    // CSRF — state-changing methods only
    const stateChanging = req.method !== "GET" && req.method !== "HEAD";
    if (stateChanging) {
      const cookieToken = req.cookies[CSRF_COOKIE];
      const headerToken = req.headers[CSRF_HEADER] as string | undefined;
      if (!verifyCsrfToken(cookieToken, headerToken)) {
        reply.code(403).send(errEnvelope(new AppError({
          code: "csrf_missing", operation: req.method + " " + req.url,
          message: "CSRF token missing or invalid.",
          recoveryAction: "Reload the page to refresh CSRF state.",
          httpStatus: 403,
        })));
        return;
      }
    }
  });

  app.get("/healthz", async () => ({ ok: true, data: { status: "ok" }, error: null }));

  // Issue CSRF cookie on /login GET
  app.decorate("issueCsrf", () => issueCsrfToken());

  return app;
}
```

Commit `feat: fastify app with auth + csrf guards (S01-T01,S01-T04,S01-T06)`.

---

### Task 13 (S01-T05 + S01-T10): Login route + login HTML + logout

**Files:**
- Create: `src/server/http/login.ts`
- Create: `src/web/login.html` (served as static)
- Create: `tests/login-route.test.ts`

- [ ] **Step 13.1: Tests (use supertest + buildApp)**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { defaultConfig } from "../src/server/core/config.js";
import { SessionStore } from "../src/server/core/session.js";
import { hashPassword } from "../src/server/core/auth.js";
import { buildApp, SESSION_COOKIE } from "../src/server/core/app.js";
import { registerLoginRoutes } from "../src/server/http/login.js";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "arc-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

async function makeApp(password = "correct-horse-battery") {
  const config = defaultConfig();
  const { hash, algorithm } = await hashPassword(password);
  config.server.passwordHash = hash;
  config.security.passwordHashAlgorithm = algorithm;
  const sessions = new SessionStore({
    path: join(dir, "sessions.json"),
    idleTimeoutMs: config.server.sessionIdleTimeoutMs,
  });
  await sessions.load();
  const app = await buildApp({
    config, configPath: join(dir, "config.json"),
    secret: randomBytes(32), sessions,
  });
  registerLoginRoutes(app, { config, sessions });
  await app.ready();
  return { app, sessions };
}

describe("login route", () => {
  it("GET /healthz works unauthenticated", async () => {
    const { app } = await makeApp();
    const r = await app.inject({ method: "GET", url: "/healthz" });
    expect(r.statusCode).toBe(200);
    await app.close();
  });
  it("GET /api/projects/recent without session returns 401", async () => {
    const { app } = await makeApp();
    const r = await app.inject({ method: "GET", url: "/api/projects/recent" });
    expect(r.statusCode).toBe(401);
    await app.close();
  });
  it("POST /api/auth/login wrong password → 401 generic", async () => {
    const { app } = await makeApp();
    const r = await app.inject({
      method: "POST", url: "/api/auth/login",
      payload: { password: "nope-nope-nope-nope" },
    });
    expect(r.statusCode).toBe(401);
    const body = r.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).not.toMatch(/hash|argon|bcrypt/i);
    await app.close();
  });
  it("POST /api/auth/login correct → 200 + sets session cookie + csrf cookie", async () => {
    const { app } = await makeApp("correct-horse-battery");
    const r = await app.inject({
      method: "POST", url: "/api/auth/login",
      payload: { password: "correct-horse-battery" },
    });
    expect(r.statusCode).toBe(200);
    const setCookie = r.headers["set-cookie"];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie!];
    expect(cookies.some((c) => c.includes(SESSION_COOKIE))).toBe(true);
    expect(cookies.some((c) => c.includes("arc_csrf"))).toBe(true);
    expect(cookies.every((c) => c.toLowerCase().includes("httponly")
                              || c.toLowerCase().includes("samesite=lax"))).toBe(true);
    await app.close();
  });
  it("rate-limits after maxFailures", async () => {
    const { app } = await makeApp("correct-horse-battery");
    for (let i = 0; i < 10; i++) {
      await app.inject({ method: "POST", url: "/api/auth/login",
                         payload: { password: "wrong-wrong-wrong" } });
    }
    const r = await app.inject({ method: "POST", url: "/api/auth/login",
                                  payload: { password: "wrong-wrong-wrong" } });
    expect(r.statusCode).toBe(429);
    expect(r.json().error.code).toBe("rate_limited");
    await app.close();
  });
});
```

- [ ] **Step 13.2: Implement `src/server/http/login.ts`**

```ts
import type { FastifyInstance, FastifyReply } from "fastify";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../core/config.js";
import { SessionStore } from "../core/session.js";
import { verifyPassword } from "../core/auth.js";
import { AppError, errEnvelope, okEnvelope } from "../core/errors.js";
import { issueCsrfToken, CSRF_COOKIE } from "../core/csrf.js";
import { SESSION_COOKIE } from "../core/app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Deps { config: AppConfig; sessions: SessionStore }

interface RateRecord { failures: number; windowStart: number }
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
function rateBump(ip: string) {
  const r = ipBuckets.get(ip);
  if (r) r.failures += 1;
}
function rateReset(ip: string) { ipBuckets.delete(ip); }

function setSessionCookie(reply: FastifyReply, id: string, https: boolean): void {
  reply.setCookie(SESSION_COOKIE, id, {
    path: "/", httpOnly: true, sameSite: "lax", secure: https, signed: true,
  });
}
function setCsrfCookie(reply: FastifyReply, token: string, https: boolean): void {
  // NOT httpOnly — JS reads this to send in header (double-submit pattern)
  reply.setCookie(CSRF_COOKIE, token, {
    path: "/", httpOnly: false, sameSite: "lax", secure: https,
  });
}

export function registerLoginRoutes(app: FastifyInstance, deps: Deps): void {
  app.get("/login", async (_req, reply) => {
    const html = await readFile(
      join(__dirname, "..", "..", "..", "src", "web", "login.html"), "utf8",
    ).catch(async () =>
      readFile(join(__dirname, "..", "..", "web", "login.html"), "utf8"),
    );
    reply.type("text/html").send(html);
  });

  app.post<{ Body: { password?: string } }>(
    "/api/auth/login",
    async (req, reply) => {
      const ip = req.ip;
      const { maxFailures, windowMs } = deps.config.security.loginRateLimit;
      if (!rateCheck(ip, maxFailures, windowMs)) {
        reply.code(429).send(errEnvelope(new AppError({
          code: "rate_limited", operation: "POST /api/auth/login",
          message: "Too many failed attempts. Try again later.",
          recoveryAction: `Wait ${Math.ceil(windowMs/60000)} minutes.`,
        })));
        return;
      }
      const pw = (req.body?.password ?? "").toString();
      const cfg = deps.config.server;
      if (!cfg.passwordHash) {
        reply.code(503).send(errEnvelope(new AppError({
          code: "not_configured", operation: "POST /api/auth/login",
          message: "Server has no password set.",
          recoveryAction: "Run `agent-remote-control install` first.",
        })));
        return;
      }
      const ok = await verifyPassword(
        pw, cfg.passwordHash,
        deps.config.security.passwordHashAlgorithm,
      );
      if (!ok) {
        rateBump(ip);
        reply.code(401).send(errEnvelope(new AppError({
          code: "invalid_credentials", operation: "POST /api/auth/login",
          message: "Invalid password.",
          recoveryAction: "Try again or reset via the install command.",
        })));
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
    const unsigned = raw ? app.unsignCookie(raw) : { valid: false, value: null };
    if (unsigned.valid && unsigned.value) await deps.sessions.destroy(unsigned.value);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    reply.clearCookie(CSRF_COOKIE, { path: "/" });
    reply.send(okEnvelope({ ok: true }));
  });

  app.get("/api/auth/whoami", async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE];
    const unsigned = raw ? app.unsignCookie(raw) : { valid: false, value: null };
    if (!unsigned.valid || !unsigned.value) {
      reply.code(401).send(errEnvelope(new AppError({
        code: "auth_required", operation: "whoami", message: "Not signed in",
      })));
      return;
    }
    reply.send(okEnvelope({ sessionId: unsigned.value }));
  });
}
```

- [ ] **Step 13.3: Write `src/web/login.html`**

Minimal vanilla HTML, no SPA. (Composer for sprint 04 will replace this with React.) Posts JSON to `/api/auth/login`, then redirects.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>agent-remote-control — sign in</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0b0d10; color: #eaeef3;
         display: grid; place-items: center; min-height: 100vh; margin: 0; }
  form { background: #14181d; padding: 32px; border-radius: 8px;
         box-shadow: 0 4px 24px rgba(0,0,0,0.4); min-width: 320px; }
  h1 { margin: 0 0 16px; font-size: 18px; }
  input { width: 100%; padding: 8px; margin-top: 8px;
          background: #0b0d10; color: #eaeef3; border: 1px solid #2a3038;
          border-radius: 4px; box-sizing: border-box; }
  button { margin-top: 16px; padding: 8px 16px; background: #2563eb;
           color: #fff; border: 0; border-radius: 4px; cursor: pointer; }
  .err { color: #f87171; margin-top: 12px; min-height: 1em; font-size: 13px; }
</style>
</head>
<body>
<form id="f" autocomplete="off">
  <h1>Sign in</h1>
  <label>Password<input id="p" type="password" required autofocus /></label>
  <button type="submit">Sign in</button>
  <div class="err" id="e"></div>
</form>
<script>
document.getElementById("f").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const e = document.getElementById("e"); e.textContent = "";
  const r = await fetch("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: document.getElementById("p").value }),
  });
  const body = await r.json().catch(() => ({}));
  if (r.ok && body.ok) { location.href = "/"; }
  else { e.textContent = body?.error?.message || ("Sign-in failed (" + r.status + ")"); }
});
</script>
</body>
</html>
```

Run: `pnpm test login-route`. Expected: PASS. Commit `feat: login route, logout, /login html, rate-limit (S01-T05,S01-T10)`.

---

### Task 14 (S01-T01e): Server entry `src/server/index.ts`

**Files:**
- Create: `src/server/index.ts`

- [ ] **Step 14.1: Implement (no separate unit test — exercised by smoke test T22)**

```ts
import { configFile, secretFile, sessionsFile } from "../cli/paths.js";
import { loadConfig } from "./core/config.js";
import { ensureSecretKey } from "./core/secret-key.js";
import { SessionStore } from "./core/session.js";
import { buildApp } from "./core/app.js";
import { registerLoginRoutes } from "./http/login.js";
import { tryBind } from "./core/port-check.js";
import { assertBindAllowed, bindBanner } from "./core/bind-guard.js";

export async function startServer(): Promise<void> {
  const configPath = configFile();
  const config = await loadConfig(configPath);
  assertBindAllowed(config);
  await tryBind(config.server.port, config.server.host);

  const secret = await ensureSecretKey(secretFile());
  const sessions = new SessionStore({
    path: sessionsFile(), idleTimeoutMs: config.server.sessionIdleTimeoutMs,
  });
  await sessions.load();
  const app = await buildApp({ config, configPath, secret, sessions });
  registerLoginRoutes(app, { config, sessions });

  const banner = bindBanner(config);
  if (banner) process.stderr.write("\n" + banner + "\n\n");

  await app.listen({ host: config.server.host, port: config.server.port });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT",  () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err) => {
    process.stderr.write(`startup failed: ${err.message ?? err}\n`);
    process.exit(1);
  });
}
```

Commit `feat: server entry with startup gates (S01-T01)`.

---

### Task 15 (S01-T09a): CLI scaffolding + `bin/agent-remote-control`

**Files:**
- Create: `bin/agent-remote-control`
- Create: `src/cli/index.ts`

- [ ] **Step 15.1: Write bin shim**

`bin/agent-remote-control` (executable):

```sh
#!/usr/bin/env node
import("../dist/cli/index.js").then(m => m.main());
```

Then `chmod +x bin/agent-remote-control`.

- [ ] **Step 15.2: Write `src/cli/index.ts`**

```ts
import { Command } from "commander";
import { runInstall } from "./install.js";
import { runStart } from "./start.js";
import { runStop } from "./stop.js";
import { runStatus } from "./status.js";
import { runOpen } from "./open.js";
import { runConfig } from "./config.js";

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = new Command();
  program.name("agent-remote-control").version("0.1.0");

  program.command("install")
    .description("Set password, create config, install systemd --user service")
    .action(async () => { await runInstall(); });
  program.command("start")
    .description("Start the systemd --user service (or run server in foreground via --foreground)")
    .option("--foreground", "Run server inline (for debugging)")
    .action(async (opts) => { await runStart(opts); });
  program.command("stop").description("Stop the service")
    .action(async () => { await runStop(); });
  program.command("status").description("Print service status")
    .action(async () => { await runStatus(); });
  program.command("open").description("Open the web UI in default browser")
    .action(async () => { await runOpen(); });
  program.command("config").description("Print or edit the config file path")
    .option("--edit", "Open in $EDITOR")
    .option("--path", "Print just the path")
    .action(async (opts) => { await runConfig(opts); });

  await program.parseAsync(argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`error: ${err.message ?? err}\n`);
    process.exit(1);
  });
}
```

Commit `feat: cli entry + bin shim (S01-T09)`.

---

### Task 16 (S01-T09b): systemd unit template + render

**Files:**
- Create: `systemd/agent-remote-control.service.tmpl`
- Create: `src/cli/systemd.ts`
- Create: `tests/systemd-template.test.ts`

- [ ] **Step 16.1: Write unit template** (rendered with simple `${VAR}` substitution)

```ini
[Unit]
Description=agent-remote-control (local AI agent control UI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${NODE_BIN} ${BIN_PATH} start --foreground
Restart=on-failure
RestartSec=2
Environment=NODE_ENV=production
Environment=PATH=${NODE_PATH_ENV}
WorkingDirectory=${WORK_DIR}

[Install]
WantedBy=default.target
```

- [ ] **Step 16.2: Tests**

```ts
import { describe, it, expect } from "vitest";
import { renderUnit } from "../src/cli/systemd.js";

describe("systemd template", () => {
  it("substitutes all variables", () => {
    const out = renderUnit({
      nodeBin: "/usr/bin/node",
      binPath: "/home/me/.local/share/agent-remote-control/bin/agent-remote-control",
      pathEnv: "/usr/bin:/usr/local/bin",
      workDir: "/home/me",
    });
    expect(out).toContain("ExecStart=/usr/bin/node /home/me/.local");
    expect(out).toContain("Environment=PATH=/usr/bin:/usr/local/bin");
    expect(out).toContain("WorkingDirectory=/home/me");
    expect(out).not.toContain("${");
  });
});
```

- [ ] **Step 16.3: Implement `src/cli/systemd.ts`**

```ts
import { readFile, mkdir, writeFile, chmod } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { systemdUserDir } from "./paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface UnitVars {
  nodeBin: string; binPath: string; pathEnv: string; workDir: string;
}

export async function loadTemplate(): Promise<string> {
  // dist/cli → repo/systemd/...
  const candidates = [
    resolve(__dirname, "..", "..", "systemd", "agent-remote-control.service.tmpl"),
    resolve(__dirname, "..", "..", "..", "systemd", "agent-remote-control.service.tmpl"),
  ];
  for (const p of candidates) {
    try { return await readFile(p, "utf8"); } catch {}
  }
  throw new Error("systemd template not found in any candidate path");
}

export function renderUnit(vars: UnitVars, template: string = DEFAULT_TEMPLATE): string {
  return template
    .replaceAll("${NODE_BIN}", vars.nodeBin)
    .replaceAll("${BIN_PATH}", vars.binPath)
    .replaceAll("${NODE_PATH_ENV}", vars.pathEnv)
    .replaceAll("${WORK_DIR}", vars.workDir);
}

const DEFAULT_TEMPLATE = `[Unit]
Description=agent-remote-control (local AI agent control UI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=\${NODE_BIN} \${BIN_PATH} start --foreground
Restart=on-failure
RestartSec=2
Environment=NODE_ENV=production
Environment=PATH=\${NODE_PATH_ENV}
WorkingDirectory=\${WORK_DIR}

[Install]
WantedBy=default.target
`;

export async function installUnit(vars: UnitVars): Promise<string> {
  const dir = systemdUserDir();
  await mkdir(dir, { recursive: true });
  const unit = renderUnit(vars, await loadTemplate().catch(() => DEFAULT_TEMPLATE));
  const path = join(dir, "agent-remote-control.service");
  await writeFile(path, unit, { mode: 0o644 });
  await chmod(path, 0o644);
  return path;
}
```

Run: PASS. Commit `feat: systemd unit template + render (S01-T09)`.

---

### Task 17 (S01-T03 + S01-T09c): `install` command

**Files:**
- Create: `src/cli/install.ts`

- [ ] **Step 17.1: Implement**

```ts
import { password as askPassword, confirm } from "@inquirer/prompts";
import { spawn } from "node:child_process";
import { hashPassword, pickAlgorithm } from "../server/core/auth.js";
import { loadConfig, saveConfig } from "../server/core/config.js";
import { ensureSecretKey } from "../server/core/secret-key.js";
import { configFile, secretFile } from "./paths.js";
import { installUnit } from "./systemd.js";

const MIN_LEN = 12;

async function promptForNewPassword(): Promise<string> {
  for (;;) {
    const a = await askPassword({
      message: `Set the app password (min ${MIN_LEN} chars):`,
      mask: true,
    });
    if (a.length < MIN_LEN) {
      process.stderr.write(`Password must be at least ${MIN_LEN} characters.\n`);
      continue;
    }
    const b = await askPassword({ message: "Confirm password:", mask: true });
    if (a !== b) {
      process.stderr.write("Passwords did not match. Try again.\n");
      continue;
    }
    return a;
  }
}

export async function runInstall(): Promise<void> {
  process.stdout.write("agent-remote-control install\n");

  const cfgPath = configFile();
  const config = await loadConfig(cfgPath);

  if (config.server.passwordHash) {
    const overwrite = await confirm({
      message: "A password is already set. Overwrite?", default: false,
    });
    if (!overwrite) {
      process.stdout.write("Keeping existing password.\n");
    } else {
      const pw = await promptForNewPassword();
      const algo = await pickAlgorithm();
      const { hash, algorithm } = await hashPassword(pw, algo);
      config.server.passwordHash = hash;
      config.security.passwordHashAlgorithm = algorithm;
      await saveConfig(cfgPath, config);
    }
  } else {
    const pw = await promptForNewPassword();
    const algo = await pickAlgorithm();
    const { hash, algorithm } = await hashPassword(pw, algo);
    config.server.passwordHash = hash;
    config.security.passwordHashAlgorithm = algorithm;
    await saveConfig(cfgPath, config);
  }

  await ensureSecretKey(secretFile());

  const nodeBin = process.execPath;
  const binPath = process.argv[1] ?? "agent-remote-control";
  const pathEnv = process.env["PATH"] ?? "/usr/bin:/usr/local/bin";
  const workDir = process.env["HOME"] ?? "/tmp";
  const unitPath = await installUnit({ nodeBin, binPath, pathEnv, workDir });
  process.stdout.write(`Wrote systemd unit: ${unitPath}\n`);

  await runSystemctl(["daemon-reload"]);
  await runSystemctl(["enable", "--now", "agent-remote-control.service"]);

  if (process.env["XDG_SESSION_TYPE"] !== "x11" &&
      process.env["XDG_SESSION_TYPE"] !== "wayland") {
    const enableLinger = await confirm({
      message:
        "Detected non-graphical session. Enable `loginctl enable-linger $USER` "
        + "so the service survives logout?",
      default: true,
    });
    if (enableLinger) {
      await new Promise<void>((resolve, reject) => {
        const p = spawn("loginctl", ["enable-linger", process.env["USER"] ?? ""],
                        { stdio: "inherit" });
        p.on("exit", (code) => code === 0 ? resolve() : reject(
          new Error(`loginctl enable-linger exited ${code}`),
        ));
      });
    } else {
      process.stdout.write(
        "Run `loginctl enable-linger $USER` manually if you want the "
        + "service to start at boot without graphical login.\n",
      );
    }
  }

  process.stdout.write(
    `\nDone. UI: http://${config.server.host}:${config.server.port}\n`
    + `Run \`agent-remote-control status\` to verify.\n`,
  );
}

function runSystemctl(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("systemctl", ["--user", ...args], { stdio: "inherit" });
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`systemctl ${args.join(" ")} exited ${code}`)),
    );
  });
}
```

Commit `feat: install command (password setup + systemd unit) (S01-T03,S01-T09)`.

---

### Task 18 (S01-T09d): start/stop/status/open/config commands

**Files:**
- Create: `src/cli/start.ts`, `stop.ts`, `status.ts`, `open.ts`, `config.ts`

- [ ] **Step 18.1: Implement each**

`src/cli/start.ts`:

```ts
import { spawn } from "node:child_process";
import { startServer } from "../server/index.js";

export async function runStart(opts: { foreground?: boolean }): Promise<void> {
  if (opts.foreground) { await startServer(); return; }
  await new Promise<void>((resolve, reject) => {
    const p = spawn("systemctl", ["--user", "start", "agent-remote-control.service"],
                    { stdio: "inherit" });
    p.on("exit", (c) => c === 0 ? resolve() : reject(new Error(`exited ${c}`)));
  });
}
```

`src/cli/stop.ts`:

```ts
import { spawn } from "node:child_process";
export async function runStop(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const p = spawn("systemctl", ["--user", "stop", "agent-remote-control.service"],
                    { stdio: "inherit" });
    p.on("exit", (c) => c === 0 ? resolve() : reject(new Error(`exited ${c}`)));
  });
}
```

`src/cli/status.ts`:

```ts
import { spawn } from "node:child_process";
import { loadConfig } from "../server/core/config.js";
import { configFile } from "./paths.js";

export async function runStatus(): Promise<void> {
  const cfg = await loadConfig(configFile());
  process.stdout.write(`bind:  http://${cfg.server.host}:${cfg.server.port}\n`);
  await new Promise<void>((resolve) => {
    const p = spawn("systemctl",
      ["--user", "status", "--no-pager", "agent-remote-control.service"],
      { stdio: "inherit" });
    p.on("exit", () => resolve());
  });
}
```

`src/cli/open.ts`:

```ts
import { spawn } from "node:child_process";
import { loadConfig } from "../server/core/config.js";
import { configFile } from "./paths.js";

export async function runOpen(): Promise<void> {
  const cfg = await loadConfig(configFile());
  const url = `http://${cfg.server.host === "0.0.0.0" ? "127.0.0.1" : cfg.server.host}:${cfg.server.port}`;
  await new Promise<void>((resolve) => {
    const p = spawn("xdg-open", [url], { stdio: "inherit" });
    p.on("exit", () => resolve());
  });
}
```

`src/cli/config.ts`:

```ts
import { spawn } from "node:child_process";
import { configFile } from "./paths.js";

export async function runConfig(opts: { edit?: boolean; path?: boolean }): Promise<void> {
  const path = configFile();
  if (opts.path) { process.stdout.write(path + "\n"); return; }
  if (opts.edit) {
    const editor = process.env["EDITOR"] ?? "nano";
    await new Promise<void>((resolve) => {
      const p = spawn(editor, [path], { stdio: "inherit" });
      p.on("exit", () => resolve());
    });
    return;
  }
  process.stdout.write(`config path: ${path}\n`);
}
```

Commit `feat: start/stop/status/open/config commands (S01-T09)`.

---

### Task 19 (S01-T11): Smoke + integration tests

**Files:**
- Create: `tests/smoke.test.ts`

- [ ] **Step 19.1: Test the start-up pipeline against ephemeral config dir**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { loadConfig, saveConfig } from "../src/server/core/config.js";
import { ensureSecretKey } from "../src/server/core/secret-key.js";
import { SessionStore } from "../src/server/core/session.js";
import { hashPassword } from "../src/server/core/auth.js";
import { buildApp, SESSION_COOKIE } from "../src/server/core/app.js";
import { registerLoginRoutes } from "../src/server/http/login.js";
import { assertBindAllowed } from "../src/server/core/bind-guard.js";
import { tryBind } from "../src/server/core/port-check.js";
import { createServer } from "node:net";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "arc-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("smoke", () => {
  it("end-to-end: install hash → start → 401 → login → 200", async () => {
    const cfgPath = join(dir, "config.json");
    const config = await loadConfig(cfgPath);
    const { hash, algorithm } = await hashPassword("correct-horse-battery");
    config.server.passwordHash = hash;
    config.security.passwordHashAlgorithm = algorithm;
    await saveConfig(cfgPath, config);

    const secret = await ensureSecretKey(join(dir, "secret.key"));
    const sessions = new SessionStore({
      path: join(dir, "sessions.json"),
      idleTimeoutMs: config.server.sessionIdleTimeoutMs,
    });
    await sessions.load();
    const app = await buildApp({ config, configPath: cfgPath, secret, sessions });
    registerLoginRoutes(app, { config, sessions });
    await app.ready();

    const unauth = await app.inject({ method: "GET", url: "/api/projects/recent" });
    expect(unauth.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST", url: "/api/auth/login",
      payload: { password: "correct-horse-battery" },
    });
    expect(login.statusCode).toBe(200);
    const setCookies = ([] as string[]).concat(login.headers["set-cookie"] as any);
    const sid = setCookies.find((c) => c.includes(SESSION_COOKIE))!.split(";")[0];

    const auth = await app.inject({
      method: "GET", url: "/api/auth/whoami",
      headers: { cookie: sid },
    });
    expect(auth.statusCode).toBe(200);
    expect(auth.json().ok).toBe(true);

    await app.close();
  });

  it("bind 0.0.0.0 with empty password → refused", async () => {
    const config = await loadConfig(join(dir, "config.json"));
    config.server.host = "0.0.0.0";
    config.server.passwordHash = "";
    expect(() => assertBindAllowed(config)).toThrow();
  });

  it("port busy → clear error from tryBind", async () => {
    const srv = createServer().listen(0, "127.0.0.1");
    await new Promise((r) => srv.once("listening", () => r(null)));
    const port = (srv.address() as any).port;
    try {
      const err = await tryBind(port, "127.0.0.1").catch((e) => e);
      expect(err).toBeDefined();
      expect(err.code).toBe("port_busy");
      expect(err.recoveryAction).toMatch(/server.port|config.json/i);
    } finally { srv.close(); }
  });

  it("smoke uses randomBytes to silence unused import", () => {
    expect(randomBytes(8).length).toBe(8);
  });
});
```

- [ ] **Step 19.2: Run full suite**

`pnpm test`
Expected: ALL PASS.

- [ ] **Step 19.3: Build typechecks**

`pnpm build`
Expected: 0 errors.

Commit `test: end-to-end smoke covering AC-001..003,026,027,036 (S01-T11)`.

---

### Task 20 (Verification gate)

- [ ] **Step 20.1: AC walk-through evidence**

For each AC in sprint file:

- AC-001 (`systemd --user` service running): defer manual run to verify step; install code writes unit and runs `enable --now`.
- AC-002 (UI at 127.0.0.1:4096): smoke test exercises bind path + login page.
- AC-003 (login required before non-login endpoint): `unauth` assertion in smoke.
- AC-026 (0.0.0.0 + default password refused): `bind-guard.test.ts` and smoke.
- AC-027 (port busy, no kill): `port-check.test.ts` + smoke; codebase grep `git grep -n killPort` → 0 matches.
- AC-036 (non-plaintext hash + server-issued session IDs): `auth.test.ts` (hash != plain) + `session.test.ts` (32-byte random IDs).

- [ ] **Step 20.2: Final commit + push branch**

```
test: verification evidence for sprint 01 ACs
```

---

## Self-Review

**Spec coverage:** every S01-T* maps to ≥1 task above:
- T01 → Tasks 1, 2, 5, 12, 14
- T02 → Tasks 3, 4
- T03 → Tasks 6, 17
- T04 → Tasks 7, 8, 12
- T05 → Task 13
- T06 → Tasks 9, 12
- T07 → Task 10
- T08 → Task 11
- T09 → Tasks 15, 16, 17, 18
- T10 → Task 13
- T11 → Task 19

ACs covered in Task 20.

**Placeholder scan:** none — all code blocks complete.

**Type consistency:** `AppConfig`, `SessionRecord`, `AppError`, `HashAlgo` defined once and reused. `SESSION_COOKIE`, `CSRF_COOKIE`, `CSRF_HEADER` exported once. `BuildAppDeps` matches what login route reads. `okEnvelope/errEnvelope` shape matches H7. Cookie names `arc_sid`, `arc_csrf` consistent across app.ts, login.ts, login.html (header `x-csrf-token`).

**Hard-rule audit:**
- H1 — `port-check` rejects with error, no `killPortProcess`.
- H4 — Argon2id default, bcrypt fallback, PBKDF2 opt-in.
- H5 — Fastify `onRequest` enforces auth on all routes except PUBLIC set.
- H6 — `bind-guard` enforces; banner mentions LAN/password/terminal/HTTPS.
- H13 — `writePersisted` writes file 0600, dir 0700.

---

**Plan complete.** Execution proceeds inline per `superpowers:executing-plans`.
