import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

interface ConfigSummary {
  server: {
    host: string;
    port: number;
    https: boolean;
    sessionIdleTimeoutMs: number;
  };
  projects: { roots: string[] };
  providers: {
    antigravity: {
      command: string;
      debugPortRange: number[];
      wrapperCommands: string[];
    };
  };
}

export function SettingsView() {
  const [config, setConfig] = useState<ConfigSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ConfigSummary>("/api/config")
      .then(setConfig)
      .catch((e: Error) => setErr(e.message));
  }, []);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 text-sm">
      <h1 className="text-lg font-semibold">Settings</h1>
      {err && (
        <p className="text-fg-2 text-xs">
          {err.includes("404")
            ? "GET /api/config not implemented yet (sprint 08)."
            : err}
        </p>
      )}
      {config && (
        <pre className="bg-bg-1 border border-border rounded p-3 text-xs font-mono overflow-auto">
          {JSON.stringify(config, null, 2)}
        </pre>
      )}
      <section className="bg-bg-1 border border-border rounded p-3">
        <h2 className="text-xs uppercase tracking-wide text-fg-2 mb-2">
          Risky toggles
        </h2>
        <p className="text-xs text-fg-2">
          Bind 0.0.0.0 requires a non-default password. Edit{" "}
          <code className="font-mono">~/.config/agent-remote-control/config.json</code>{" "}
          and restart the service. The web UI surface lands in sprint 08.
        </p>
      </section>
    </div>
  );
}
