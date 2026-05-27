import { JSDOM } from "jsdom";
import { createHash } from "node:crypto";
import type { ActionDescriptor } from "../IProviderAdapter.js";

/**
 * Extract action button descriptors from a sanitized snapshot HTML string.
 * Each descriptor carries:
 *   - `actionId` — stable server-issued ID derived from
 *     {tag, text, occurrenceIndex, kind}.
 *   - `label` — visible text.
 *   - `kind` — one of `approval | button | input`.
 *
 * The mapping `actionId → { tag, text, occurrenceIndex }` is kept server-side
 * inside `ActionRegistry`. The HTTP route accepts ONLY the actionId; the
 * frontend can never invent or pass a selector (H9, AC-034, REQ-114).
 */

const APPROVAL_TEXTS = new Set([
  "allow",
  "deny",
  "approve",
  "reject",
  "accept",
  "decline",
  "yes",
  "no",
  "review changes",
  "apply changes",
  "discard changes",
  "run",
  "skip",
]);

const TARGET_TAGS = ["button", "[role=button]", "a"] as const;

export interface ActionTarget {
  actionId: string;
  tag: string;
  text: string;
  occurrenceIndex: number;
  enabled: boolean;
  kind: ActionDescriptor["kind"];
}

export function deriveActionId(
  tag: string,
  text: string,
  occurrenceIndex: number,
): string {
  const h = createHash("sha256");
  h.update(`${tag}\0${text}\0${occurrenceIndex}`);
  return "act_" + h.digest("hex").slice(0, 16);
}

export function extractActions(sanitizedHtml: string): ActionTarget[] {
  const dom = new JSDOM(`<!doctype html><body>${sanitizedHtml}</body>`);
  const doc = dom.window.document;
  const seen = new Map<string, number>(); // tag|text → next occurrenceIndex
  const out: ActionTarget[] = [];

  const candidates: Element[] = [];
  for (const sel of TARGET_TAGS) {
    candidates.push(...Array.from(doc.querySelectorAll(sel)));
  }
  // Deduplicate (a tag matched by multiple selectors)
  const uniq = new Set<Element>(candidates);

  for (const el of uniq) {
    const rawText = (el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (!rawText || rawText.length > 120) continue;
    // Leaf-most filter: ignore wrappers that contain other buttons.
    if (el.querySelector("button, [role=button], a")) continue;

    const tag = el.tagName.toLowerCase();
    const key = `${tag}|${rawText.toLowerCase()}`;
    const occurrenceIndex = seen.get(key) ?? 0;
    seen.set(key, occurrenceIndex + 1);

    const lowered = rawText.toLowerCase();
    const kind: ActionDescriptor["kind"] = APPROVAL_TEXTS.has(lowered)
      ? "approval"
      : "button";

    const disabled =
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true";

    out.push({
      actionId: deriveActionId(tag, rawText, occurrenceIndex),
      tag,
      text: rawText,
      occurrenceIndex,
      enabled: !disabled,
      kind,
    });
  }
  return out;
}

/**
 * Per-session registry mapping the server-issued `actionId` back to the raw
 * { tag, text, occurrenceIndex } needed to dispatch the CDP click. Cleared on
 * every snapshot refresh.
 */
export class ActionRegistry {
  private map = new Map<string, ActionTarget>();

  rebuild(actions: ActionTarget[]): void {
    this.map.clear();
    for (const a of actions) this.map.set(a.actionId, a);
  }
  list(): ActionDescriptor[] {
    return Array.from(this.map.values()).map((a) => ({
      actionId: a.actionId,
      label: a.text,
      kind: a.kind,
      enabled: a.enabled,
    }));
  }
  resolve(actionId: string): ActionTarget | undefined {
    return this.map.get(actionId);
  }
}
