import {
  allUnsupportedCapabilities,
  type ProviderId,
  type Session,
} from "../../domains/types.js";
import { AppError } from "../../core/errors.js";
import type {
  ActionDescriptor,
  ConversationDescriptor,
  DetectResult,
  DiscoveredSession,
  IProviderAdapter,
  SnapshotPayload,
} from "../IProviderAdapter.js";

export class DisabledAdapter implements IProviderAdapter {
  constructor(
    public readonly providerId: ProviderId,
    public readonly displayName: string,
    public readonly note: string,
  ) {}

  async detect(): Promise<DetectResult> {
    return {
      available: false,
      capabilities: allUnsupportedCapabilities(),
      note: this.note,
    };
  }

  async listDiscoveredSessions(): Promise<DiscoveredSession[]> {
    return [];
  }

  async start(): Promise<Session> {
    throw this.unsupported("start");
  }
  async attach(): Promise<Session> {
    throw this.unsupported("attach");
  }
  async stop(): Promise<void> {
    throw this.unsupported("stop");
  }
  async dispose(): Promise<void> {
    throw this.unsupported("dispose");
  }
  async sendPrompt(): Promise<void> {
    throw this.unsupported("sendPrompt");
  }
  async sendInput(): Promise<void> {
    throw this.unsupported("sendInput");
  }
  async listConversations(): Promise<ConversationDescriptor[]> {
    return [];
  }
  async selectConversation(): Promise<void> {
    throw this.unsupported("selectConversation");
  }
  async getSnapshot(): Promise<SnapshotPayload> {
    throw this.unsupported("getSnapshot");
  }
  async getStatus(): Promise<Session["status"]> {
    return "unknown";
  }
  async getActions(): Promise<ActionDescriptor[]> {
    return [];
  }
  async performAction(): Promise<void> {
    throw this.unsupported("performAction");
  }

  private unsupported(op: string): AppError {
    return new AppError({
      code: "provider_disabled",
      operation: `${this.providerId}.${op}`,
      message: `${this.displayName} is not enabled in Phase 1.`,
      recoveryAction:
        "Select Antigravity, or wait for the Phase 2 release that enables this provider.",
      httpStatus: 409,
    });
  }
}
