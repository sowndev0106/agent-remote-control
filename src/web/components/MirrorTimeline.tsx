import { useEffect, useRef } from "react";
import { useSessions } from "../stores/sessions.js";

/**
 * Sandboxed iframe (`sandbox=""` — no scripts) renders the sanitized mirror
 * HTML via srcdoc. The host page never injects raw provider HTML.
 *
 * NFR-002 + H11: app shell CSP is never relaxed; iframe srcdoc gets its own
 * baseline (no inline scripts allowed by the sandbox attribute itself).
 */
export function MirrorTimeline() {
  const { snapshot, status, errorMessage, refreshSnapshot } = useSessions();
  const ref = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const id = setInterval(() => { void refreshSnapshot(); }, 2000);
    return () => clearInterval(id);
  }, [refreshSnapshot]);

  if (status === "idle") {
    return <Placeholder>Attach a session to see the live mirror.</Placeholder>;
  }
  if (status === "connecting") {
    return <Placeholder>Connecting…</Placeholder>;
  }
  if (status === "error") {
    return <Placeholder kind="error">{errorMessage ?? "Adapter error"}</Placeholder>;
  }

  const html = snapshot?.html ?? "<i>(empty snapshot)</i>";
  const srcdoc = `<!doctype html><html><head><meta charset="utf-8"/><style>
    body { font: 13px system-ui, sans-serif; color: #eaeef3; background: #0b0d10; padding: 12px; }
    button { background: #1a1f25; color: #eaeef3; border: 1px solid #2a3038; border-radius: 4px; padding: 4px 8px; }
    a { color: #60a5fa; }
  </style></head><body>${html}</body></html>`;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="text-[10px] text-fg-2 font-mono px-2 py-1 border-b border-border flex items-center gap-3">
        <span>hash: {snapshot?.hash ?? "—"}</span>
        <span>captured: {snapshot ? new Date(snapshot.capturedAt).toLocaleTimeString() : "—"}</span>
        <button
          type="button"
          onClick={() => void refreshSnapshot()}
          className="ml-auto px-1.5 py-0.5 bg-bg-2 border border-border rounded"
        >
          refresh
        </button>
      </div>
      <iframe
        ref={ref}
        sandbox=""
        title="Antigravity mirror"
        srcDoc={srcdoc}
        data-testid="mirror-iframe"
        className="flex-1 w-full bg-bg-0"
      />
    </div>
  );
}

function Placeholder({ children, kind }: { children: React.ReactNode; kind?: "error" }) {
  const cls = kind === "error" ? "text-danger" : "text-fg-2";
  return (
    <div className={`flex-1 grid place-items-center text-sm ${cls}`}>{children}</div>
  );
}
