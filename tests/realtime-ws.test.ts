import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import { defaultConfig } from "../src/server/core/config.js";
import { hashPassword } from "../src/server/core/auth.js";
import { SESSION_COOKIE } from "../src/server/core/app.js";
import { assembleServer, type AssembledServer } from "../src/server/assembly.js";
import { EVENT_TYPES, envelope } from "../src/server/core/realtime/events.js";
import { mountRealtimeWS } from "../src/server/core/realtime/ws.js";
import { mountTerminalWS } from "../src/server/core/realtime/terminal-ws.js";

let dir: string;
let assembled: AssembledServer;
let baseWsUrl: string;
let cookieHeader: string;
const password = "correct-horse-battery";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "arc-realtime-ws-"));
  const config = defaultConfig();
  const { hash, algorithm } = await hashPassword(password);
  config.server.passwordHash = hash;
  config.security.passwordHashAlgorithm = algorithm;
  assembled = await assembleServer({
    config,
    paths: {
      configFile: join(dir, "config.json"),
      secretFile: join(dir, "secret.key"),
      sessionsFile: join(dir, "sessions.json"),
      projectsFile: join(dir, "projects.json"),
    },
    overrides: {
      secret: randomBytes(32),
      skipIpc: true,
      skipWs: true,
      skipPermissionAudit: true,
    },
  });
});

afterEach(async () => {
  await assembled.shutdown();
  await rm(dir, { recursive: true, force: true });
});

async function login(): Promise<void> {
  const res = await assembled.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { password },
  });
  const setCookies = ([] as string[]).concat(res.headers["set-cookie"] as never);
  const sid = setCookies.find((cookie) => cookie.includes(SESSION_COOKIE))!.split(";")[0]!;
  const csrf = setCookies.find((cookie) => cookie.includes("arc_csrf"))!.split(";")[0]!;
  cookieHeader = `${sid}; ${csrf}`;
}

async function listenWithMountedWs(): Promise<void> {
  await assembled.app.ready();
  await login();
  await assembled.app.listen({ host: "127.0.0.1", port: 0 });
  const address = assembled.app.server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind TCP");
  baseWsUrl = `ws://127.0.0.1:${address.port}`;
}

function openWs(path: string): WebSocket {
  return new WebSocket(`${baseWsUrl}${path}`, {
    headers: { cookie: cookieHeader },
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

function waitMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once("message", (raw) => resolve(raw.toString("utf8")));
  });
}

describe("realtime websocket", () => {
  it("broadcasts bus events to authenticated websocket clients", async () => {
    mountRealtimeWS({
      app: assembled.app,
      bus: assembled.deps.bus,
      sessions: assembled.deps.cookieSessions,
    });
    await listenWithMountedWs();

    const ws = openWs("/api/realtime");
    await waitOpen(ws);
    const nextMessage = waitMessage(ws);
    assembled.deps.bus.publish(
      envelope(EVENT_TYPES.ProviderStatusChanged, { ready: true }),
    );

    expect(JSON.parse(await nextMessage)).toMatchObject({
      type: EVENT_TYPES.ProviderStatusChanged,
      version: 1,
      payload: { ready: true },
    });
    ws.close();
  });
});

describe("terminal websocket", () => {
  it("replays buffered output and forwards client input to the terminal service", async () => {
    let dataHandler: ((chunk: string) => void) | null = null;
    let exitHandler: ((info: { exitCode: number }) => void) | null = null;
    const terminal = {
      get: vi.fn(() => ({})),
      buffer: vi.fn(() => "boot-buffer"),
      onData: vi.fn((_id: string, cb: (chunk: string) => void) => {
        dataHandler = cb;
        return vi.fn();
      }),
      onExit: vi.fn((_id: string, cb: (info: { exitCode: number }) => void) => {
        exitHandler = cb;
        return vi.fn();
      }),
      write: vi.fn(),
    };
    mountTerminalWS({
      app: assembled.app,
      sessions: assembled.deps.cookieSessions,
      terminal: terminal as never,
    });
    await listenWithMountedWs();

    const ws = openWs("/api/terminal/tabs/t1/stream");
    try {
      const buffered = waitMessage(ws);
      await waitOpen(ws);
      await expect(buffered).resolves.toBe("boot-buffer");

      ws.send("typed");
      await vi.waitFor(() => {
        expect(terminal.write).toHaveBeenCalledWith("t1", "typed");
      });

      const streamed = waitMessage(ws);
      dataHandler?.("live-output");
      await expect(streamed).resolves.toBe("live-output");

      const exited = waitMessage(ws);
      exitHandler?.({ exitCode: 7 });
      expect(await exited).toContain("[process exited: 7]");
    } finally {
      ws.close();
    }
  });
});
