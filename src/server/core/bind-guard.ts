import type { AppConfig } from "./config.js";
import { AppError } from "./errors.js";

export function assertBindAllowed(c: AppConfig): void {
  if (c.server.host === "0.0.0.0" && c.server.passwordHash === "") {
    throw new AppError({
      code: "bind_refused_default_password",
      operation: "Bind 0.0.0.0",
      message: "Refusing to bind 0.0.0.0 without a password set.",
      recoveryAction:
        "Run `agent-remote-control install` to set a password, then restart.",
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
