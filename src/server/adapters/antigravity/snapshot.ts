import { createHash } from "node:crypto";
import { sanitizeMirrorHtml } from "./sanitize.js";
import type { CDPClient } from "./cdp.js";
import { AppError } from "../../core/errors.js";
import type { SnapshotPayload } from "../IProviderAdapter.js";

const CAPTURE_SCRIPT = `
  (() => {
    const cascade =
      document.getElementById('conversation') ||
      document.getElementById('chat') ||
      document.getElementById('cascade');
    if (!cascade) {
      return JSON.stringify({
        ok: false,
        reason: 'workbench DOM root not found',
        bodyText: (document.body && document.body.innerText || '').slice(0, 500),
      });
    }
    return JSON.stringify({
      ok: true,
      html: cascade.outerHTML,
      text: cascade.innerText,
      title: document.title,
    });
  })();
`;

interface CaptureRaw {
  ok: boolean;
  reason?: string;
  html?: string;
  text?: string;
  title?: string;
  bodyText?: string;
}

export function hashHtml(html: string): string {
  return createHash("sha256").update(html, "utf8").digest("hex").slice(0, 16);
}

export async function captureSnapshot(cdp: CDPClient): Promise<SnapshotPayload> {
  const result = await cdp.call<{ result: { value?: string; type?: string } }>(
    "Runtime.evaluate",
    {
      expression: CAPTURE_SCRIPT,
      returnByValue: true,
      awaitPromise: false,
    },
  );
  const raw = result?.result?.value;
  if (typeof raw !== "string") {
    throw new AppError({
      code: "snapshot_failed",
      operation: "captureSnapshot",
      message: "CDP Runtime.evaluate returned no string payload.",
    });
  }
  let parsed: CaptureRaw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError({
      code: "snapshot_failed",
      operation: "captureSnapshot",
      message: "Capture script returned non-JSON.",
    });
  }
  if (!parsed.ok || !parsed.html) {
    const errBody: {
      code: string;
      operation: string;
      message: string;
      recoveryAction: string;
      detail?: string;
    } = {
      code: "snapshot_stale",
      operation: "captureSnapshot",
      message: parsed.reason ?? "snapshot unavailable",
      recoveryAction: "Open an Antigravity conversation, then refresh.",
    };
    if (parsed.bodyText !== undefined) errBody.detail = parsed.bodyText;
    throw new AppError(errBody);
  }
  const html = sanitizeMirrorHtml(parsed.html);
  const text = parsed.text ?? "";
  const payload: SnapshotPayload = {
    hash: hashHtml(html),
    capturedAt: Date.now(),
    html,
    text,
  };
  return payload;
}
