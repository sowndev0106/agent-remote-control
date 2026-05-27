import { createServer, type Server, type Socket } from "node:net";
import { chmod, unlink } from "node:fs/promises";
import { AppError } from "../core/errors.js";

export interface IpcRequest {
  nonce: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface IpcResponse {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

export type IpcMethod = (
  params: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Minimal newline-delimited JSON IPC server over a Unix socket.
 * Auth: every request body must include `nonce` matching the server nonce.
 * Socket file is created with 0600 permissions, sitting inside the 0700
 * config directory.
 */
export class IpcServer {
  private server: Server | null = null;
  private readonly methods = new Map<string, IpcMethod>();

  constructor(
    private readonly path: string,
    private readonly nonce: string,
  ) {}

  register(method: string, handler: IpcMethod): void {
    this.methods.set(method, handler);
  }

  async start(): Promise<void> {
    await unlink(this.path).catch(() => {
      /* file may not exist */
    });
    this.server = createServer((socket) => this.handle(socket));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.path, () => {
        this.server!.off("error", reject);
        resolve();
      });
    });
    await chmod(this.path, 0o600).catch(() => {
      /* unix sockets default to user-owned anyway */
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    await unlink(this.path).catch(() => {});
    this.server = null;
  }

  private handle(socket: Socket): void {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let i: number;
      while ((i = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        this.dispatch(socket, line).catch((err) => {
          this.send(socket, {
            ok: false,
            error: { code: "ipc_internal", message: String(err) },
          });
        });
      }
    });
    socket.on("error", () => {
      /* swallow; the wrapper CLI handles disconnects */
    });
  }

  private async dispatch(socket: Socket, line: string): Promise<void> {
    let req: IpcRequest;
    try {
      req = JSON.parse(line) as IpcRequest;
    } catch {
      this.send(socket, {
        ok: false,
        error: { code: "ipc_invalid_json", message: "request not JSON" },
      });
      return;
    }
    if (req.nonce !== this.nonce) {
      this.send(socket, {
        ok: false,
        error: { code: "ipc_auth_failed", message: "invalid nonce" },
      });
      return;
    }
    const fn = this.methods.get(req.method);
    if (!fn) {
      this.send(socket, {
        ok: false,
        error: {
          code: "ipc_unknown_method",
          message: `no method ${req.method}`,
        },
      });
      return;
    }
    try {
      const data = await fn(req.params ?? {});
      this.send(socket, { ok: true, data });
    } catch (err: unknown) {
      if (err instanceof AppError) {
        this.send(socket, {
          ok: false,
          error: { code: err.code, message: err.message },
        });
        return;
      }
      this.send(socket, {
        ok: false,
        error: { code: "ipc_handler_error", message: String(err) },
      });
    }
  }

  private send(socket: Socket, body: IpcResponse): void {
    try {
      socket.write(JSON.stringify(body) + "\n");
    } catch {
      /* socket may have closed */
    }
  }
}
