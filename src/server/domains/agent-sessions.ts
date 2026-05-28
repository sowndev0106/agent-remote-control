import { randomBytes } from "node:crypto";
import type {
  Lifecycle,
  ProviderId,
  Session,
  SessionStatus,
  SourceType,
} from "./types.js";
import { allUnknownCapabilities } from "./types.js";

/**
 * In-memory session registry. Sprint 02 ships only the data shape; actual
 * provider sessions are created by the CDP adapter in sprint 03+ and by PTY in
 * sprint 05+. The store is the single owner of `sessionId`s (H9: server-issued).
 */
export class AgentSessionRegistry {
  private byId = new Map<string, Session>();

  list(): Session[] {
    return Array.from(this.byId.values());
  }
  get(id: string): Session | undefined {
    return this.byId.get(id);
  }
  set(session: Session): void {
    this.byId.set(session.sessionId, session);
  }
  remove(id: string): boolean {
    return this.byId.delete(id);
  }

  static newId(): string {
    return randomBytes(12).toString("hex");
  }

  static makeSession(args: {
    providerId: ProviderId;
    source: SourceType;
    projectPath?: string;
    status?: SessionStatus;
    lifecycle?: Lifecycle;
    owned?: boolean;
  }): Session {
    const s: Session = {
      sessionId: AgentSessionRegistry.newId(),
      providerId: args.providerId,
      source: args.source,
      status: args.status ?? "unknown",
      lifecycle: args.lifecycle ?? "discovered",
      capabilities: allUnknownCapabilities(),
      owned: args.owned ?? false,
    };
    if (args.projectPath !== undefined) s.projectPath = args.projectPath;
    return s;
  }
}
