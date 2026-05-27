/**
 * Realtime event catalogue (REQ-111, H8).
 * Every WebSocket event MUST use the envelope:
 *   { type, projectId?, sessionId?, version, payload }
 * Adding a new event type? Add it here first; emitters MUST reference these
 * constants so we can grep for unused types and verify a fixed shape.
 */
export const EVENT_TYPES = {
  ProviderStatusChanged: "provider.status.changed",
  ProviderSnapshotChanged: "provider.snapshot.changed",
  ProviderActionsChanged: "provider.actions.changed",
  SessionLifecycleChanged: "session.lifecycle.changed",
  TerminalOutput: "terminal.output",
  TerminalLifecycleChanged: "terminal.lifecycle.changed",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface Envelope<P = unknown> {
  type: EventType;
  projectId?: string;
  sessionId?: string;
  version: number;
  payload: P;
}

export function envelope<P>(
  type: EventType,
  payload: P,
  opts: { projectId?: string; sessionId?: string; version?: number } = {},
): Envelope<P> {
  const out: Envelope<P> = {
    type,
    version: opts.version ?? 1,
    payload,
  };
  if (opts.projectId !== undefined) out.projectId = opts.projectId;
  if (opts.sessionId !== undefined) out.sessionId = opts.sessionId;
  return out;
}
