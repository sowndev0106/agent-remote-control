import { createHash } from "node:crypto";
import { Terminal } from "@xterm/headless";
import { escapeForAppDom } from "../antigravity/sanitize.js";
import type { SnapshotPayload } from "../IProviderAdapter.js";

export interface AgySnapshotBufferOpts {
  cols?: number;
  rows?: number;
  scrollback: number;
}

export class AgySnapshotBuffer {
  private readonly term: Terminal;

  constructor(opts: AgySnapshotBufferOpts) {
    this.term = new Terminal({
      cols: opts.cols ?? 100,
      rows: opts.rows ?? 30,
      scrollback: opts.scrollback,
      allowProposedApi: true,
    });
  }

  write(chunk: string): void {
    const core = (this.term as any)._core;
    if (core?._writeBuffer?.writeSync) {
      core._writeBuffer.writeSync(chunk);
    } else {
      this.term.write(chunk);
    }
  }

  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows);
  }

  snapshot(): SnapshotPayload {
    const text = this.serializeText();
    const html = this.renderHtml(text);
    return {
      hash: createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16),
      capturedAt: Date.now(),
      text,
      html,
    };
  }

  private serializeText(): string {
    const buffer = this.term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i += 1) {
      const line = buffer.getLine(i);
      if (!line) continue;
      lines.push(line.translateToString(true));
    }
    return lines.join("\n").replace(/\s+$/u, "");
  }

  private renderHtml(text: string): string {
    const escaped = escapeForAppDom(text);
    return `<pre class="agy-terminal" data-provider="agy">${escaped}</pre>`;
  }
}
