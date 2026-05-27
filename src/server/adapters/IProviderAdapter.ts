import type {
  CapabilityMap,
  ProviderId,
  Session,
} from "../domains/types.js";

export interface DetectResult {
  available: boolean;
  capabilities: CapabilityMap;
  note?: string;
}

export interface DiscoveredSession {
  sessionId: string;
  providerId: ProviderId;
  source: Session["source"];
  hint: string;
  projectPath?: string;
  active?: boolean;
}

export interface SnapshotPayload {
  hash: string;
  capturedAt: number;
  html?: string;
  text?: string;
}

export interface ActionDescriptor {
  actionId: string;
  label: string;
  kind: "button" | "approval" | "input";
  enabled: boolean;
}

export interface ConversationDescriptor {
  conversationId: string;
  title: string;
  startedAt?: number;
}

export interface PromptContext {
  conversationId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Provider adapter contract — REQ-026.
 * Every method returns normalized data shapes (REQ-026A).
 */
export interface IProviderAdapter {
  readonly providerId: ProviderId;

  detect(): Promise<DetectResult>;
  listDiscoveredSessions(projectPath: string): Promise<DiscoveredSession[]>;

  start(projectPath: string, options?: Record<string, unknown>): Promise<Session>;
  attach(session: Session): Promise<Session>;
  stop(session: Session): Promise<void>;
  dispose(session: Session): Promise<void>;

  sendPrompt(session: Session, text: string, context?: PromptContext): Promise<void>;
  sendInput(session: Session, input: string): Promise<void>;

  listConversations(session: Session): Promise<ConversationDescriptor[]>;
  selectConversation(session: Session, conversationId: string): Promise<void>;

  getSnapshot(session: Session): Promise<SnapshotPayload>;
  getStatus(session: Session): Promise<Session["status"]>;
  getActions(session: Session): Promise<ActionDescriptor[]>;
  performAction(session: Session, actionId: string): Promise<void>;
}
