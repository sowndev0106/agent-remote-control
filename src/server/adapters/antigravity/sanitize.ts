import createDOMPurify, { type DOMPurify as DOMPurifyType } from "dompurify";
import { JSDOM } from "jsdom";

let purifyInstance: DOMPurifyType | null = null;
function purify(): DOMPurifyType {
  if (!purifyInstance) {
    const window = new JSDOM("").window;
    // DOMPurify accepts a Window-like object from jsdom; cast through unknown.
    purifyInstance = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);
  }
  return purifyInstance;
}

/**
 * Sanitize scraped Antigravity DOM before any consumer renders it.
 * Strips <script>, inline event handlers, javascript: URLs.
 * Preserves action-button attributes the mirror needs (data-*, aria-*, role).
 *
 * H11: every consumer of scraped DOM MUST call this function. The mirror
 * iframe uses srcdoc + relaxed CSP — never insert raw provider HTML elsewhere.
 */
export function sanitizeMirrorHtml(rawHtml: string): string {
  const p = purify();
  return p.sanitize(rawHtml, {
    FORBID_TAGS: ["script", "object", "embed", "iframe", "link", "meta"],
    FORBID_ATTR: [
      "onerror",
      "onload",
      "onclick",
      "onmouseover",
      "onmouseout",
      "onmouseenter",
      "onmouseleave",
      "onkeydown",
      "onkeyup",
      "onfocus",
      "onblur",
      "onsubmit",
    ],
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
    KEEP_CONTENT: true,
  }) as string;
}

/**
 * Escape arbitrary scraped text before inserting into app-owned DOM (NFR-004).
 */
export function escapeForAppDom(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
