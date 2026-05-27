import { createConnection } from "node:net";

export async function ipcCall<T = unknown>(
  socketPath: string,
  nonce: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const sock = createConnection({ path: socketPath });
    let buffer = "";
    let done = false;

    const finishOk = (data: T): void => {
      done = true;
      sock.end();
      resolve(data);
    };
    const finishErr = (err: Error): void => {
      done = true;
      sock.destroy();
      reject(err);
    };

    sock.on("connect", () => {
      sock.write(JSON.stringify({ nonce, method, params }) + "\n");
    });
    sock.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const i = buffer.indexOf("\n");
      if (i === -1) return;
      const line = buffer.slice(0, i);
      try {
        const body = JSON.parse(line) as {
          ok: boolean;
          data?: T;
          error?: { code: string; message: string };
        };
        if (body.ok && body.data !== undefined) finishOk(body.data);
        else if (body.ok) finishOk(undefined as never);
        else finishErr(new Error(body.error?.message ?? "ipc call failed"));
      } catch (err) {
        finishErr(err as Error);
      }
    });
    sock.on("error", (err) => {
      if (!done) finishErr(err);
    });
    sock.on("close", () => {
      if (!done) finishErr(new Error("ipc connection closed before reply"));
    });
  });
}
