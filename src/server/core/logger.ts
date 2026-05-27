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

export interface LoggerEnv {
  env?: string;
  level?: string;
}

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
