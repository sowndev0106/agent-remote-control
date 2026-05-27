import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "../stores/projects.js";

export function ProjectPicker() {
  const { recent, browse, loadRecent, loadBrowse, select } = useProjects();
  const [path, setPath] = useState("~");
  const [manualPath, setManualPath] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [pendingManual, setPendingManual] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void loadRecent();
    void loadBrowse(path, showHidden);
  }, [loadRecent, loadBrowse, path, showHidden]);

  async function pickProject(p: string, confirmManual = false) {
    setErrMsg(null);
    try {
      const project = await select(p, confirmManual);
      navigate(`/workspace/${project.id}`);
    } catch (err) {
      const e = err as { body?: { code?: string; message?: string }; message?: string };
      if (e.body?.code === "manual_confirm_required") {
        setPendingManual(true);
        setErrMsg(e.body.message ?? "Outside configured roots — confirm to add anyway.");
      } else {
        setErrMsg(e.body?.message ?? e.message ?? "Could not select project.");
      }
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 max-w-6xl mx-auto">
      <section className="bg-bg-1 border border-border rounded p-3">
        <h2 className="text-sm font-semibold text-fg-1 mb-2">Recent projects</h2>
        {recent.length === 0 && (
          <p className="text-fg-2 text-xs">No recent projects yet.</p>
        )}
        <ul className="space-y-1">
          {recent.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => navigate(`/workspace/${p.id}`)}
                className="w-full text-left hover:bg-bg-2 rounded px-2 py-1.5"
              >
                <div className="text-sm">{p.name}</div>
                <div className="text-xs text-fg-2 font-mono truncate">{p.path}</div>
                {p.recommendations.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.recommendations.map((r) => (
                      <span
                        key={r.marker}
                        className="text-[10px] bg-bg-3 text-fg-1 rounded px-1.5 py-0.5 font-mono"
                      >
                        {r.marker}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-bg-1 border border-border rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-fg-1">Browse folders</h2>
          <label className="text-xs text-fg-2 flex items-center gap-1">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            show hidden
          </label>
        </div>
        <div className="flex gap-2 mb-2">
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="flex-1 bg-bg-0 border border-border rounded px-2 py-1 font-mono text-xs"
          />
          {browse?.parent && (
            <button
              type="button"
              className="text-xs bg-bg-2 border border-border rounded px-2"
              onClick={() => setPath(browse.parent ?? "~")}
            >
              ↑
            </button>
          )}
        </div>
        <ul className="max-h-96 overflow-auto divide-y divide-border">
          {browse?.entries.map((e) => (
            <li key={e.path}>
              <button
                type="button"
                disabled={!e.isDir}
                onClick={() => e.isDir && setPath(e.path)}
                onDoubleClick={() => e.isDir && pickProject(e.path)}
                className="w-full text-left hover:bg-bg-2 rounded px-2 py-1 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                <span className={e.isDir ? "text-accent" : "text-fg-2"}>
                  {e.isDir ? "▸" : "·"}
                </span>
                <span className="flex-1 truncate">{e.name}</span>
                {e.recommendations.length > 0 && (
                  <span className="text-[10px] bg-bg-3 rounded px-1 font-mono">
                    {e.recommendations.map((m) => m.marker).join(",")}
                  </span>
                )}
                {e.isDir && (
                  <button
                    type="button"
                    onClick={(ev) => { ev.stopPropagation(); pickProject(e.path); }}
                    className="text-[10px] bg-accent text-white rounded px-1.5 py-0.5"
                  >
                    pick
                  </button>
                )}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input
            placeholder="manual path (absolute)"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            className="flex-1 bg-bg-0 border border-border rounded px-2 py-1 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => pickProject(manualPath, pendingManual)}
            className="text-xs bg-accent hover:bg-accent-hover text-white rounded px-2"
          >
            {pendingManual ? "Confirm add" : "Add"}
          </button>
        </div>
        {errMsg && <p className="mt-2 text-xs text-danger">{errMsg}</p>}
      </section>
    </div>
  );
}
