import { createServer } from "node:net";
import { AppError } from "./errors.js";

export async function tryBind(port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const srv = createServer();
    srv.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new AppError({
            code: "port_busy",
            operation: `Bind to ${host}:${port}`,
            message: `Port ${port} on ${host} is already in use.`,
            detail:
              "Another process is holding the port. The app will not kill it (REQ-008, H1).",
            recoveryAction:
              "Stop the other process or set a different port in config.json (server.port).",
            httpStatus: 503,
          }),
        );
        return;
      }
      reject(err);
    });
    srv.listen(port, host, () => srv.close(() => resolve()));
  });
}
