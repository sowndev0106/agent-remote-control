import { describe, expect, it } from "vitest";
import {
  AGY_FIXED_ACTIONS,
  detectApprovalActions,
  getAgyActions,
  inputForAgyAction,
} from "../src/server/adapters/agy/actions.js";

describe("agy actions", () => {
  it("returns fixed shortcut actions when running", () => {
    const actions = getAgyActions({ running: true, text: "" });
    expect(actions.map((a) => a.actionId)).toContain("agy.send");
    expect(actions.map((a) => a.actionId)).toContain("agy.ctrl_c");
    expect(actions.every((a) => a.enabled)).toBe(true);
  });

  it("disables fixed actions when not running", () => {
    const actions = getAgyActions({ running: false, text: "" });
    expect(actions.find((a) => a.actionId === "agy.send")?.enabled).toBe(false);
  });

  it.each([
    ["[Y/n]", ["agy.approve"]],
    [" [y/N] ", ["agy.approve"]],
    ["Approve? (y/n)", ["agy.approve"]],
    ["Press y to approve", ["agy.approve"]],
    ["(a)pprove (d)eny", ["agy.approve", "agy.deny"]],
    ["ordinary output", []],
    ["y/n appears inside a sentence", []],
    ["Approve all? maybe later", []],
  ])("detects approvals in %j", (line, ids) => {
    expect(detectApprovalActions(line).map((a) => a.actionId)).toEqual(ids);
  });

  it("maps action IDs to server-side inputs", () => {
    expect(inputForAgyAction("agy.send")).toBe("\r");
    expect(inputForAgyAction("agy.cancel")).toBe("\x1b");
    expect(inputForAgyAction("agy.approve")).toBe("y\n");
    expect(inputForAgyAction("agy.deny")).toBe("n\n");
    expect(inputForAgyAction("not.real")).toBeUndefined();
  });

  it("keeps every fixed action under the agy namespace", () => {
    expect(AGY_FIXED_ACTIONS.every((a) => a.actionId.startsWith("agy."))).toBe(true);
  });

  it("detects approvals when pre-seeded with many leading lines", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `log line ${i}`).join("\n") + "\nApprove? (y/n)";
    const actions = detectApprovalActions(lines);
    expect(actions.map((a) => a.actionId)).toEqual(["agy.approve"]);
  });

  it("detects approvals colored with ANSI escape sequences", () => {
    const text = "\x1b[33m[Y/n]\x1b[0m";
    const actions = detectApprovalActions(text);
    expect(actions.map((a) => a.actionId)).toEqual(["agy.approve"]);
  });
});
