import { useEffect } from "react";
import { useSessions } from "../stores/sessions.js";
import type { ProviderId } from "../stores/types.js";

const SOURCE_LABELS: Record<string, string> = {
  cdp: "CDP",
  "managed-pty": "Managed PTY",
  wrapper: "Wrapper",
  tmux: "tmux",
  screen: "screen",
  unmanaged: "External",
};

export function SessionDiscoveryList({
  projectId,
  provider,
}: {
  projectId: string;
  provider?: ProviderId;
}) {
  const { discovered, discover, attach, launch } = useSessions();

  useEffect(() => {
    void discover(projectId, provider);
  }, [discover, projectId, provider]);

  return (
    <div className="border border-border rounded bg-bg-1 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wide text-fg-2">
          Discovered Antigravity sessions
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void discover(projectId, provider)}
            className="text-xs bg-bg-2 border border-border rounded px-2 py-1"
          >
            refresh
          </button>
          <button
            type="button"
            onClick={() => void launch(projectId, provider)}
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
          {discovered.map((s) => {
            const isExternal = s.source === "unmanaged" || s.attachable === false;
            return (
              <li
                key={s.sessionId}
                className="bg-bg-2 rounded px-2 py-1.5"
                data-testid={`discovered-${s.source}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase bg-bg-3 rounded px-1 font-mono">
                    {SOURCE_LABELS[s.source] ?? s.source}
                  </span>
                  <span className="text-sm flex-1 truncate">{s.hint}</span>
                  <button
                    type="button"
                    disabled={isExternal}
                    onClick={() => !isExternal && void attach(s.sessionId)}
                    data-testid={`attach-${s.sessionId}`}
                    className={
                      "text-xs rounded px-2 py-0.5 " +
                      (isExternal
                        ? "bg-bg-3 text-fg-2 cursor-not-allowed"
                        : "bg-accent text-white")
                    }
                  >
                    {isExternal
                      ? "not controllable"
                      : s.source === "managed-pty" || s.source === "wrapper"
                        ? "resume"
                        : "attach"}
                  </button>
                </div>
                {isExternal && s.guidance && (
                  <div className="mt-1 text-[11px] text-fg-2 bg-bg-0 border border-border rounded p-2">
                    <div>{s.guidance.message}</div>
                    <code className="block mt-1 font-mono text-fg-1">
                      {s.guidance.recommendedCommand}
                    </code>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
