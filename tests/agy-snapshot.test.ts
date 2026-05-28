import { describe, expect, it } from "vitest";
import { AgySnapshotBuffer } from "../src/server/adapters/agy/snapshot.js";

describe("AgySnapshotBuffer", () => {
  it("captures text, html, timestamp, and a stable hash", () => {
    const buffer = new AgySnapshotBuffer({ cols: 40, rows: 6, scrollback: 100 });
    buffer.write("hello \x1b[31mred\x1b[0m\nnext");
    const a = buffer.snapshot();
    const b = buffer.snapshot();
    expect(a.text).toContain("hello red");
    expect(a.text).toContain("next");
    expect(a.html).toContain("hello");
    expect(a.html).not.toContain("<script");
    expect(a.hash).toBe(b.hash);
    expect(a.capturedAt).toBeGreaterThan(0);
  });

  it("changes hash when new output arrives", () => {
    const buffer = new AgySnapshotBuffer({ cols: 20, rows: 4, scrollback: 100 });
    buffer.write("before");
    const before = buffer.snapshot().hash;
    buffer.write("\nafter");
    expect(buffer.snapshot().hash).not.toBe(before);
  });

  it("escapes TUI text in html without corrupting content", () => {
    const buffer = new AgySnapshotBuffer({ cols: 40, rows: 4, scrollback: 100 });
    buffer.write("<img src=x onerror=alert(1)>");
    const snap = buffer.snapshot();
    
    // Safe representation in text
    expect(snap.text).toContain("<img");
    expect(snap.text).toContain("onerror=alert(1)");
    
    // Safe HTML output: Escaped tags, intact content
    expect(snap.html).toContain("&lt;img");
    expect(snap.html).toContain("onerror="); // Safe because '<' is escaped to '&lt;'
    expect(snap.html).not.toContain("<img"); // No actual HTML element injection
  });
});
