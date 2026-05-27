import { useEffect } from "react";
import { useSessions } from "../stores/sessions.js";

export function ActionPanel() {
  const { active, actions, refreshActions, performAction, status, errorMessage } =
    useSessions();

  useEffect(() => {
    const id = setInterval(() => { void refreshActions(); }, 2500);
    return () => clearInterval(id);
  }, [refreshActions]);

  if (!active) {
    return (
      <aside className="w-72 border-l border-border bg-bg-1 p-3 text-xs text-fg-2">
        No session attached.
      </aside>
    );
  }

  return (
    <aside className="w-72 border-l border-border bg-bg-1 flex flex-col">
      <div className="p-3 border-b border-border">
        <h3 className="text-xs uppercase tracking-wide text-fg-2 mb-1">Status</h3>
        <div className="text-sm">{active.lifecycle}</div>
        <div className="text-xs font-mono text-fg-2 truncate">{active.sessionId}</div>
        {status !== "idle" && (
          <div className="text-[11px] mt-1">
            <span className="font-mono">{status}</span>
            {errorMessage && (
              <div className="mt-1 text-danger">{errorMessage}</div>
            )}
          </div>
        )}
      </div>

      <div className="p-3 border-b border-border">
        <h3 className="text-xs uppercase tracking-wide text-fg-2 mb-1">Capabilities</h3>
        <ul className="space-y-1 text-xs">
          {Object.entries(active.capabilities).map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span className="text-fg-1">{k}</span>
              <span
                className={
                  v === "supported"
                    ? "text-ok"
                    : v === "unknown"
                    ? "text-warn"
                    : "text-fg-2"
                }
              >
                {v}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-3 flex-1 overflow-auto">
        <h3 className="text-xs uppercase tracking-wide text-fg-2 mb-1">Actions</h3>
        {actions.length === 0 && (
          <p className="text-xs text-fg-2">No actions in current snapshot.</p>
        )}
        <ul className="space-y-1">
          {actions.map((a) => (
            <li key={a.actionId}>
              <button
                type="button"
                disabled={!a.enabled}
                onClick={() => void performAction(a.actionId)}
                data-testid={`action-${a.actionId}`}
                data-action-id={a.actionId}
                className={
                  "w-full text-left text-xs rounded px-2 py-1 border " +
                  (a.enabled
                    ? "border-border bg-bg-2 hover:border-accent"
                    : "border-border bg-bg-2 text-fg-2 opacity-50 cursor-not-allowed")
                }
                title={`actionId: ${a.actionId} (server-issued)`}
              >
                <span
                  className={
                    "inline-block mr-2 text-[10px] rounded px-1 font-mono " +
                    (a.kind === "approval"
                      ? "bg-warn/20 text-warn"
                      : "bg-bg-3 text-fg-2")
                  }
                >
                  {a.kind}
                </span>
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
