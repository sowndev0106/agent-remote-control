import { describe, it, expect } from "vitest";
import {
  escapeForAppDom,
  sanitizeMirrorHtml,
} from "../src/server/adapters/antigravity/sanitize.js";

describe("sanitizeMirrorHtml", () => {
  it("strips <script>", () => {
    const out = sanitizeMirrorHtml(`<div>hi<script>alert(1)</script></div>`);
    expect(out.toLowerCase()).not.toContain("<script");
  });

  it("strips inline onerror/onclick", () => {
    const out = sanitizeMirrorHtml(
      `<img src="x" onerror="alert(1)" /><button onclick="x()">b</button>`,
    );
    expect(out).not.toMatch(/onerror|onclick/i);
  });

  it("strips javascript: URLs", () => {
    const out = sanitizeMirrorHtml(`<a href="javascript:alert(1)">x</a>`);
    expect(out).not.toMatch(/javascript:/i);
  });

  it("preserves data-* and aria-* attributes used by the mirror", () => {
    const out = sanitizeMirrorHtml(
      `<button data-action="allow" aria-label="Allow">Allow</button>`,
    );
    expect(out).toMatch(/data-action="allow"/);
    expect(out).toMatch(/aria-label="Allow"/);
  });

  it("strips iframes", () => {
    const out = sanitizeMirrorHtml(`<iframe src="evil"></iframe>`);
    expect(out.toLowerCase()).not.toContain("<iframe");
  });
});

describe("escapeForAppDom", () => {
  it("escapes HTML metacharacters", () => {
    expect(escapeForAppDom("<b>&'\"</b>")).toBe(
      "&lt;b&gt;&amp;&#39;&quot;&lt;/b&gt;",
    );
  });
});
