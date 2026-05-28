import type { Session } from "../../domains/types.js";
import type {
  ActionDescriptor,
  ConversationDescriptor,
  DetectResult,
  DiscoveredSession,
  IProviderAdapter,
  SnapshotPayload,
} from "../IProviderAdapter.js";
import { AgyPtyAdapter } from "./pty.js";
import { AgyWrapperAdapter } from "./wrapper.js";

interface AgySessionOps {
  attach(s: Session): Promise<Session>;
  stop(s: Session): Promise<void>;
  dispose(s: Session): Promise<void>;
  sendPrompt(s: Session, text: string): Promise<void>;
  sendInput(s: Session, input: string): Promise<void>;
  listConversations(s: Session): Promise<ConversationDescriptor[]>;
  selectConversation(s: Session, id: string): Promise<void>;
  getSnapshot(s: Session): Promise<SnapshotPayload>;
  getStatus(s: Session): Promise<Session["status"]>;
  getActions(s: Session): Promise<ActionDescriptor[]>;
  performAction(s: Session, id: string): Promise<void>;
}

/**
 * The agy provider seam. Routes session-bound calls to the server-owned
 * `agy-pty` surface or the user-terminal `agy-wrapper` surface by
 * `session.source`. Launch/detect/discovery go to the pty surface.
 */
export class AgyAdapter implements IProviderAdapter {
  readonly providerId = "agy" as const;

  constructor(private inner: { pty: AgyPtyAdapter; wrapper: AgyWrapperAdapter }) {}

  private route(session: Session): AgySessionOps {
    return session.source === "agy-wrapper" ? this.inner.wrapper : this.inner.pty;
  }

  detect(): Promise<DetectResult> {
    return this.inner.pty.detect();
  }

  async listDiscoveredSessions(projectPath?: string): Promise<DiscoveredSession[]> {
    const [pty, wrapper] = await Promise.all([
      this.inner.pty.listDiscoveredSessions(projectPath),
      this.inner.wrapper.listDiscoveredSessions(projectPath),
    ]);
    return [...pty, ...wrapper];
  }

  start(projectPath: string): Promise<Session> {
    return this.inner.pty.start(projectPath);
  }

  attach(s: Session): Promise<Session> {
    return this.route(s).attach(s);
  }
  stop(s: Session): Promise<void> {
    return this.route(s).stop(s);
  }
  dispose(s: Session): Promise<void> {
    return this.route(s).dispose(s);
  }
  sendPrompt(s: Session, text: string): Promise<void> {
    return this.route(s).sendPrompt(s, text);
  }
  sendInput(s: Session, input: string): Promise<void> {
    return this.route(s).sendInput(s, input);
  }
  listConversations(s: Session): Promise<ConversationDescriptor[]> {
    return this.route(s).listConversations(s);
  }
  selectConversation(s: Session, id: string): Promise<void> {
    return this.route(s).selectConversation(s, id);
  }
  getSnapshot(s: Session): Promise<SnapshotPayload> {
    return this.route(s).getSnapshot(s);
  }
  getStatus(s: Session): Promise<Session["status"]> {
    return this.route(s).getStatus(s);
  }
  getActions(s: Session): Promise<ActionDescriptor[]> {
    return this.route(s).getActions(s);
  }
  performAction(s: Session, id: string): Promise<void> {
    return this.route(s).performAction(s, id);
  }

  async shutdown(): Promise<void> {
    await this.inner.pty.shutdown();
    await this.inner.wrapper.shutdown();
  }
}
