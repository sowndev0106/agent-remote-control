import { randomBytes } from "node:crypto";
import { readPersisted, writePersisted } from "./persistence.js";

export interface SessionRecord {
  id: string;
  createdAt: number;
  lastSeenAt: number;
}

interface SessionData {
  sessions: Record<string, SessionRecord>;
}

export class SessionStore {
  private sessions = new Map<string, SessionRecord>();
  private readonly path: string;
  private readonly idleTimeoutMs: number;
  public now: () => number;

  constructor(opts: { path: string; idleTimeoutMs: number; now?: () => number }) {
    this.path = opts.path;
    this.idleTimeoutMs = opts.idleTimeoutMs;
    this.now = opts.now ?? Date.now;
  }

  async load(): Promise<void> {
    const data = await readPersisted<SessionData>(this.path);
    if (data?.sessions) {
      for (const [id, rec] of Object.entries(data.sessions)) {
        this.sessions.set(id, rec);
      }
    }
  }

  private async persist(): Promise<void> {
    const out: SessionData = { sessions: Object.fromEntries(this.sessions) };
    await writePersisted(this.path, out);
  }

  async create(): Promise<SessionRecord> {
    const id = randomBytes(32).toString("base64url");
    const t = this.now();
    const rec: SessionRecord = { id, createdAt: t, lastSeenAt: t };
    this.sessions.set(id, rec);
    await this.persist();
    return rec;
  }

  get(id: string): SessionRecord | undefined {
    const rec = this.sessions.get(id);
    if (!rec) return undefined;
    if (this.now() - rec.lastSeenAt > this.idleTimeoutMs) {
      // Evict from in-memory map only. Persistence reconciles on next
      // create/touch/destroy. Avoids fire-and-forget I/O on a hot read path.
      this.sessions.delete(id);
      return undefined;
    }
    return rec;
  }

  async touch(id: string): Promise<void> {
    const rec = this.sessions.get(id);
    if (!rec) return;
    rec.lastSeenAt = this.now();
    await this.persist();
  }

  async destroy(id: string): Promise<void> {
    if (this.sessions.delete(id)) await this.persist();
  }

  size(): number {
    return this.sessions.size;
  }
}
