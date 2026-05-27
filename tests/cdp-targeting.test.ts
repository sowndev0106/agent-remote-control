import { describe, it, expect } from "vitest";
import {
  ActionRegistry,
  deriveActionId,
  extractActions,
} from "../src/server/adapters/antigravity/targeting.js";

describe("extractActions", () => {
  it("finds buttons and assigns stable IDs", () => {
    const html = `
      <div>
        <button>Allow</button>
        <button>Deny</button>
        <button>Run</button>
      </div>
    `;
    const actions = extractActions(html);
    expect(actions.length).toBe(3);
    expect(actions[0]!.kind).toBe("approval");
    expect(actions[0]!.actionId.startsWith("act_")).toBe(true);
    expect(actions[0]!.actionId).toBe(deriveActionId("button", "Allow", 0));
  });

  it("uses occurrence index for duplicate text", () => {
    const html = `<button>Run</button><button>Run</button>`;
    const actions = extractActions(html);
    expect(actions.length).toBe(2);
    expect(actions[0]!.actionId).not.toBe(actions[1]!.actionId);
    expect(actions[0]!.occurrenceIndex).toBe(0);
    expect(actions[1]!.occurrenceIndex).toBe(1);
  });

  it("ignores wrapper containing children buttons (leaf-most filter)", () => {
    const html = `<div role="button">outer<button>inner</button></div>`;
    const actions = extractActions(html);
    expect(actions.map((a) => a.text)).toEqual(["inner"]);
  });

  it("marks disabled controls", () => {
    const html = `<button disabled>Apply</button>`;
    const actions = extractActions(html);
    expect(actions[0]!.enabled).toBe(false);
  });

  it("recognizes role=button divs", () => {
    const html = `<div role="button">Send</div>`;
    expect(extractActions(html).map((a) => a.text)).toContain("Send");
  });
});

describe("ActionRegistry", () => {
  it("rebuild + resolve", () => {
    const reg = new ActionRegistry();
    const actions = extractActions(`<button>Allow</button><button>Deny</button>`);
    reg.rebuild(actions);
    expect(reg.list().length).toBe(2);
    const allow = reg.list().find((a) => a.label === "Allow")!;
    const target = reg.resolve(allow.actionId)!;
    expect(target.text).toBe("Allow");
    expect(target.tag).toBe("button");
    expect(reg.resolve("not-a-real-id")).toBeUndefined();
  });
});
