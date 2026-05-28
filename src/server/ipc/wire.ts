import { IpcServer } from "./server.js";
import { ensureIpcNonce, ipcSocketPath } from "./nonce.js";
import type { AntigravityWrapperAdapter } from "../adapters/antigravity/wrapper.js";
import type { AgyWrapperAdapter } from "../adapters/agy/wrapper.js";

interface WireDeps {
  wrapper: AntigravityWrapperAdapter;
  agyWrapper: AgyWrapperAdapter;
  reservePort: () => Promise<number>;
  releasePort: (port: number) => void;
}

/**
 * Register every IPC method on a pre-built IpcServer. Split out from
 * `startIpcServer` so tests can drive the wire against a temp socket without
 * touching the user's config dir.
 */
export function registerIpcMethods(server: IpcServer, deps: WireDeps): void {
  server.register("reserve-port", async () => {
    const port = await deps.reservePort();
    return { port };
  });

  server.register("register-session", async (params) => {
    const pid = typeof params.pid === "number" ? params.pid : undefined;
    const debugPort = Number(params.debugPort);
    const projectPath =
      typeof params.projectPath === "string" ? params.projectPath : undefined;
    if (!Number.isFinite(debugPort)) {
      throw new Error("debugPort is required");
    }
    const args: { pid?: number; debugPort: number; projectPath?: string } = {
      debugPort,
    };
    if (pid !== undefined) args.pid = pid;
    if (projectPath !== undefined) args.projectPath = projectPath;
    const session = deps.wrapper.register(args);
    return { sessionId: session.sessionId };
  });

  server.register("unregister-session", async (params) => {
    const sessionId = String(params.sessionId);
    deps.wrapper.unregister(sessionId);
    return { ok: true };
  });

  // agy-wrapper IPC bridge: register a user-launched agy session, forward PTY
  // chunks server-side, and let the wrapper drain UI-queued input.
  server.register("agy-register", async (params) => {
    const args: { pid?: number; projectPath?: string } = {};
    if (typeof params.pid === "number") args.pid = params.pid;
    if (typeof params.projectPath === "string") args.projectPath = params.projectPath;
    const session = deps.agyWrapper.register(args);
    return { sessionId: session.sessionId };
  });

  server.register("agy-output", async (params) => {
    const sessionId = String(params.sessionId);
    const chunk = typeof params.chunk === "string" ? params.chunk : "";
    deps.agyWrapper.receiveOutput(sessionId, chunk);
    return { ok: true };
  });

  server.register("agy-poll-input", async (params) => {
    const sessionId = String(params.sessionId);
    return { input: deps.agyWrapper.pollInput(sessionId) };
  });

  server.register("agy-unregister", async (params) => {
    const sessionId = String(params.sessionId);
    deps.agyWrapper.unregister(sessionId);
    return { ok: true };
  });
}

export async function startIpcServer(deps: WireDeps): Promise<IpcServer> {
  const nonce = await ensureIpcNonce();
  const server = new IpcServer(ipcSocketPath(), nonce);
  registerIpcMethods(server, deps);
  await server.start();
  return server;
}

export class DebugPortPool {
  private inUse = new Set<number>();
  constructor(private range: number[]) {}

  reserve(): number {
    for (const port of this.range) {
      if (!this.inUse.has(port)) {
        this.inUse.add(port);
        return port;
      }
    }
    throw new Error("no free debug port");
  }
  release(port: number): void {
    this.inUse.delete(port);
  }
}
