import { describe, expect, it } from "vitest";
import { ClaudeAdapter } from "../src/server/adapters/stub/claude.js";
import { CodexAdapter } from "../src/server/adapters/stub/codex.js";
import { OpencodeAdapter } from "../src/server/adapters/stub/opencode.js";

describe("disabled provider adapters", () => {
  it("reports every future provider as unavailable with unsupported capabilities", async () => {
    for (const adapter of [
      new ClaudeAdapter(),
      new CodexAdapter(),
      new OpencodeAdapter(),
    ]) {
      const detected = await adapter.detect();
      expect(detected.available).toBe(false);
      expect(detected.capabilities.launch).toBe("unsupported");
      expect(await adapter.listDiscoveredSessions()).toEqual([]);
      expect(await adapter.getStatus()).toBe("unknown");
      expect(await adapter.getActions()).toEqual([]);
      expect(await adapter.listConversations()).toEqual([]);
    }
  });

  it("throws normalized disabled-provider errors for unsupported commands", async () => {
    const adapter = new CodexAdapter();

    await expect(adapter.start()).rejects.toMatchObject({
      code: "provider_disabled",
      operation: "codex.start",
      httpStatus: 409,
    });
    await expect(adapter.performAction()).rejects.toMatchObject({
      code: "provider_disabled",
      operation: "codex.performAction",
    });
  });
});
