export type Capability = "supported" | "unsupported" | "unknown";

export type ProviderId = "antigravity" | "agy" | "claude" | "codex" | "opencode";

export const CAPABILITY_KEYS = [
  "launch",
  "attach",
  "stop",
  "sendPrompt",
  "sendInput",
  "listConversations",
  "selectConversation",
  "getSnapshot",
  "getStatus",
  "getActions",
  "performAction",
  "dispose",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export type CapabilityMap = Record<CapabilityKey, Capability>;

export function allUnknownCapabilities(): CapabilityMap {
  return Object.fromEntries(
    CAPABILITY_KEYS.map((k) => [k, "unknown" as Capability]),
  ) as CapabilityMap;
}

export function allUnsupportedCapabilities(): CapabilityMap {
  return Object.fromEntries(
    CAPABILITY_KEYS.map((k) => [k, "unsupported" as Capability]),
  ) as CapabilityMap;
}

export interface SlashCommandDescriptor {
  id: string;
  label: string;
  command: string;
  enabled: boolean;
}

export interface ProviderInfo {
  id: ProviderId;
  displayName: string;
  enabled: boolean;
  available: boolean;
  status: "future" | "unavailable" | "ready";
  capabilities: CapabilityMap;
  note?: string;
  slashCommands?: SlashCommandDescriptor[];
}

export interface RecommendationMarker {
  marker:
    | ".git"
    | "AGENTS.md"
    | "GEMINI.md"
    | ".agents/"
    | ".opencode/"
    | ".claude/"
    | ".codex/"
    | ".antigravitycli/";
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

export type SessionStatus =
  | "starting"
  | "running"
  | "attached"
  | "detached"
  | "stopped"
  | "errored"
  | "unknown";

export type Lifecycle =
  | "owned-launching"
  | "owned-running"
  | "owned-stopped"
  | "external-attached"
  | "external-unmanaged"
  | "discovered";

export type SourceType =
  | "cdp"
  | "managed-pty"
  | "wrapper"
  | "tmux"
  | "screen"
  | "unmanaged"
  | "agy-pty"
  | "agy-wrapper"
  | "agy-unmanaged";

export interface Session {
  sessionId: string;
  providerId: ProviderId;
  source: SourceType;
  projectPath?: string;
  status: SessionStatus;
  lifecycle: Lifecycle;
  capabilities: CapabilityMap;
  owned: boolean;
  startedAt?: number;
  lastSeenAt?: number;
  note?: string;
}
