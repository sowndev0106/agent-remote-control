/**
 * Escape arbitrary scraped/terminal text before inserting into app-owned DOM
 * (NFR-004). Provider-neutral: used by both the Antigravity DOM sanitizer and
 * the agy terminal snapshot renderer, so neither adapter depends on the other.
 */
export function escapeForAppDom(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
