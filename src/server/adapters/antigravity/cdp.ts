import WebSocket from "ws";
import { AppError } from "../../core/errors.js";

export interface CDPTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

const CDP_CALL_TIMEOUT_MS = 30_000;

export interface CDPClient {
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
  close(): void;
  isOpen(): boolean;
  onEvent(handler: (method: string, params: unknown) => void): () => void;
  onClose(handler: () => void): () => void;
}

/**
 * Connect to a CDP debug URL. Uses a single WS, a centralized message handler,
 * a pendingCalls map with timeout, and a method-event subscribe surface.
 *
 * Ported from POC `connectCDP` (ref-source/antigravity_phone_chat/server.js:149)
 * but tightened: no global mutable execution-context list, no implicit
 * `Runtime.enable` (callers do this when they need it).
 */
export async function connectCDP(url: string): Promise<CDPClient> {
  const ws = new WebSocket(url, { perMessageDeflate: false });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (err) => reject(err));
  });

  let idCounter = 1;
  const pending = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: unknown) => void;
      timer: NodeJS.Timeout;
    }
  >();
  const eventHandlers = new Set<(method: string, params: unknown) => void>();
  const closeHandlers = new Set<() => void>();

  ws.on("message", (raw) => {
    let data: { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown };
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (typeof data.id === "number" && pending.has(data.id)) {
      const p = pending.get(data.id)!;
      pending.delete(data.id);
      clearTimeout(p.timer);
      if (data.error) p.reject(data.error);
      else p.resolve(data.result);
      return;
    }
    if (data.method) {
      for (const h of eventHandlers) {
        try {
          h(data.method, data.params);
        } catch {
          /* ignore handler error */
        }
      }
    }
  });

  ws.on("close", () => {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(
        new AppError({
          code: "cdp_disconnected",
          operation: "cdp.call",
          message: "CDP connection closed before reply.",
        }),
      );
    }
    pending.clear();
    for (const h of closeHandlers) {
      try {
        h();
      } catch {
        /* ignore */
      }
    }
  });

  return {
    call<T>(method: string, params?: unknown): Promise<T> {
      if (ws.readyState !== ws.OPEN) {
        return Promise.reject(
          new AppError({
            code: "cdp_disconnected",
            operation: "cdp.call",
            message: `CDP socket is not open (readyState=${ws.readyState})`,
          }),
        );
      }
      const id = idCounter++;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(
              new AppError({
                code: "cdp_timeout",
                operation: `cdp.${method}`,
                message: `CDP call ${method} timed out after ${CDP_CALL_TIMEOUT_MS}ms.`,
              }),
            );
          }
        }, CDP_CALL_TIMEOUT_MS);
        pending.set(id, {
          resolve: (v) => resolve(v as T),
          reject,
          timer,
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close(): void {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
    isOpen(): boolean {
      return ws.readyState === ws.OPEN;
    },
    onEvent(handler) {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
    onClose(handler) {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
  };
}
