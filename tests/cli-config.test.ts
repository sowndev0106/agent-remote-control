import { afterEach, describe, expect, it, vi } from "vitest";
import { runConfig } from "../src/cli/config.js";

afterEach(() => vi.restoreAllMocks());

describe("runConfig", () => {
  it("--path prints only the config path plus newline", async () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runConfig({ path: true });
    expect(out).toHaveBeenCalledTimes(1);
    expect(String(out.mock.calls[0]![0])).toMatch(
      /agent-remote-control\/config\.json\n$/,
    );
  });

  it("default opts print a human-readable config path line", async () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runConfig();
    expect(String(out.mock.calls[0]![0])).toMatch(/^config path: /);
  });
});
