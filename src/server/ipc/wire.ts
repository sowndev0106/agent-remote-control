import { IpcServer } from "./server.js";
import { ensureIpcNonce, ipcSocketPath } from "./nonce.js";
import type { AntigravityWrapperAdapter } from "../adapters/antigravity/wrapper.js";

interface WireDeps {
  wrapper: AntigravityWrapperAdapter;
  reservePort: () => Promise<number>;
  releasePort: (port: number) => void;
}

export async function startIpcServer(deps: WireDeps): Promise<IpcServer> {
  const nonce = await ensureIpcNonce();
  const server = new IpcServer(ipcSocketPath(), nonce);

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
