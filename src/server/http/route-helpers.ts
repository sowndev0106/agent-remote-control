// src/server/http/route-helpers.ts
import type { FastifyReply } from "fastify";
import { AppError, errEnvelope } from "../core/errors.js";
import type { SessionStoreLite } from "../domains/sessions.js";
import type { Session } from "../domains/types.js";

/**
 * Build the canonical 404 AppError for a missing agent session. Routes throw
 * it; Fastify's error handler converts to envelope.
 */
export function notFoundEnvelope(id: string, operation: string): AppError {
  return new AppError({
    code: "session_not_found",
    operation,
    message: `No session with id ${id}`,
    httpStatus: 404,
  });
}

export function resolveSession(
  store: SessionStoreLite,
  id: string,
): Session | undefined {
  return store.get(id);
}

/**
 * Reply with the canonical 404 envelope for a missing agent session and
 * return true. Returns false when the id resolves.
 */
export function rejectIfMissing(
  store: SessionStoreLite,
  id: string,
  reply: FastifyReply,
  operation = "session lookup",
): Session | null {
  const s = store.get(id);
  if (s) return s;
  reply.code(404).send(errEnvelope(notFoundEnvelope(id, operation)));
  return null;
}

/**
 * Require a string field on a request body. Throws AppError(400) with a code
 * derived from the field name (`<field>_required`). The error envelope is
 * returned by the global Fastify error handler — no per-route boilerplate.
 */
export function requireBodyString(
  body: unknown,
  field: string,
  operation: string,
): string {
  const v = (body as Record<string, unknown> | null | undefined)?.[field];
  if (typeof v !== "string" || v.length === 0) {
    throw new AppError({
      code: `${field}_required`,
      operation,
      message: `Request body must include \`${field}\` as a non-empty string.`,
      httpStatus: 400,
    });
  }
  return v;
}

/**
 * Generic variant of `rejectIfMissing` for any store with a `get(id)` method
 * (e.g. `TerminalService`). The caller supplies the AppError to send when the
 * lookup misses, so the error code/operation/message stay route-specific.
 */
export function rejectIfMissingFrom<T>(
  store: { get(id: string): T | undefined },
  id: string,
  reply: FastifyReply,
  notFoundError: AppError,
): T | null {
  const v = store.get(id);
  if (v) return v;
  reply.code(notFoundError.httpStatus).send(errEnvelope(notFoundError));
  return null;
}
