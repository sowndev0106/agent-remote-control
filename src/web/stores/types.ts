// Mirror server-side types — kept in sync by hand for now. Sprint 08 may
// generate from a shared schema.

export type Capability = "supported" | "unsupported" | "unknown";
export type ProviderId = "antigravity" | "claude" | "codex" | "opencode";

export interface CapabilityMap {
  launch: Capability;
  attach: Capability;
  stop: Capability;
  sendPrompt: Capability;
  sendInput: Capability;
  listConversations: Capability;
  selectConversation: Capability;
  getSnapshot: Capability;
  getActions: Capability;
  performAction: Capability;
  dispose: Capability;
}

export interface ProviderInfo {
  id: ProviderId;
  displayName: string;
  enabled: boolean;
  available: boolean;
  status: "future" | "unavailable" | "ready";
  capabilities: CapabilityMap;
  note?: string;
}

export interface RecommendationMarker {
  marker: string;
}

export interface ProjectInfo {
  id: string;
  path: string;
  name: string;
  addedAt: number;
  lastSelectedAt: number;
  lastProviderId?: ProviderId;
  lastSessionId?: string;
  recommendations: RecommendationMarker[];
}

export interface SessionInfo {
  sessionId: string;
  providerId: ProviderId;
  source: string;
  projectPath?: string;
  status: string;
  lifecycle: string;
  capabilities: CapabilityMap;
  owned: boolean;
}

export interface ActionDescriptor {
  actionId: string;
  label: string;
  kind: "button" | "approval" | "input";
  enabled: boolean;
}

export interface SnapshotPayload {
  hash: string;
  capturedAt: number;
  html?: string;
  text?: string;
}
