import { beforeEach, describe, expect, it } from "vitest";
import { useProviders } from "../../src/web/stores/providers.js";
import { mockFetchOk, resetStores } from "./helpers.js";

beforeEach(() => resetStores());

describe("providers store", () => {
  it("load populates the providers list from /api/providers", async () => {
    const providers = [
      {
        id: "antigravity",
        displayName: "Antigravity",
        enabled: true,
        available: true,
        status: "ready",
        capabilities: {},
      },
    ];
    const fetchFn = mockFetchOk({ providers });
    await useProviders.getState().load();
    expect(String(fetchFn.mock.calls[0]![0])).toBe("/api/providers");
    expect(useProviders.getState().providers).toHaveLength(1);
    expect(useProviders.getState().providers[0]!.id).toBe("antigravity");
  });
});
