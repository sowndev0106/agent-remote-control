import { useEffect } from "react";
import { useSessions } from "../stores/sessions.js";

const SOURCE_LABELS: Record<string, string> = {
  cdp: "CDP",
  "managed-pty": "Managed PTY",
  wrapper: "Wrapper",
  tmux: "tmux",
  screen: "screen",
  unmanaged: "External",
};

export function SessionDiscoveryList({ projectId }: { projectId: string }) {
  const { discovered, discover, attach, launch } = useSessions();

  useEffect(() => {
    void discover(projectId);
  }, [discover, projectId]);

  return (
    <div className="border border-border rounded bg-bg-1 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wide text-fg-2">
          Discovered Antigravity sessions
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void discover(projectId)}
            className="text-xs bg-bg-2 border border-border rounded px-2 py-1"
          >
            refresh
          </button>
          <button
            type="button"
            onClick={() => void launch(projectId)}
            className="text-xs bg-accent hover:bg-accent-hover text-white rounded px-2 py-1"
            data-testid="launch-session"
          >
            launch new
          </button>
        </div>
      </div>
      {discovered.length === 0 ? (
        <p className="text-xs text-fg-2">
          No Antigravity CDP targets reachable. Launch one, or open Antigravity with{" "}
          <code className="font-mono">--remote-debugging-port=9000</code>.
        </p>
      ) : (
        <ul className="space-y-1">
          {discovered.map((s) => (
            <li
              key={s.sessionId}
              className="flex items-center gap-2 bg-bg-2 rounded px-2 py-1.5"
            >
              <span className="text-[10px] uppercase bg-bg-3 rounded px-1 font-mono">
                {SOURCE_LABELS[s.source] ?? s.source}
              </span>
              <span className="text-sm flex-1 truncate">{s.hint}</span>
              <button
                type="button"
                onClick={() => void attach(s.sessionId)}
                data-testid={`attach-${s.sessionId}`}
                className="text-xs bg-accent text-white rounded px-2 py-0.5"
              >
                {s.source === "managed-pty" || s.source === "wrapper"
                  ? "resume"
                  : "attach"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
