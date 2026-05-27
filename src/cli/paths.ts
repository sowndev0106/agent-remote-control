import { homedir } from "node:os";
import { join } from "node:path";

const xdg = (env: string, fallback: string): string =>
  process.env[env] ?? join(homedir(), fallback);

export function configDir(): string {
  return join(xdg("XDG_CONFIG_HOME", ".config"), "agent-remote-control");
}

export function configFile(): string {
  return join(configDir(), "config.json");
}

export function secretFile(): string {
  return join(configDir(), "secret.key");
}

export function sessionsFile(): string {
  return join(configDir(), "sessions.json");
}

export function systemdUserDir(): string {
  return join(xdg("XDG_CONFIG_HOME", ".config"), "systemd", "user");
}
