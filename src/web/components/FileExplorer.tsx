import { useEffect, useState } from "react";
import { useFiles, type FileTreeEntry } from "../stores/files.js";

function TreeNode({ entry, depth }: { entry: FileTreeEntry; depth: number }) {
  const { expanded, expand, collapse, openPreview } = useFiles();
  const isOpen = entry.path in expanded;
  const children = expanded[entry.path] ?? [];

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (entry.isDir) {
            isOpen ? collapse(entry.path) : void expand(entry.path);
          } else {
            void openPreview(entry.path);
          }
        }}
        data-testid={`file-${entry.relPath}`}
        className="w-full text-left hover:bg-bg-2 rounded px-1 py-0.5 text-xs flex items-center gap-1"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <span className={entry.isDir ? "text-accent" : "text-fg-2"}>
          {entry.isDir ? (isOpen ? "▾" : "▸") : "·"}
        </span>
        <span className="truncate">{entry.name}</span>
      </button>
      {isOpen && children.length > 0 && (
        <ul>
          {children.map((c) => (
            <TreeNode key={c.path} entry={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FileExplorer({ projectId }: { projectId: string }) {
  const {
    rootEntries,
    setProject,
    loadRoot,
    showHidden,
    toggleHidden,
    search,
    searchResults,
    openPreview,
  } = useFiles();
  const [q, setQ] = useState("");

  useEffect(() => {
    setProject(projectId);
  }, [projectId, setProject]);

  useEffect(() => {
    void loadRoot();
  }, [loadRoot, projectId]);

  return (
    <aside className="w-64 border-r border-border bg-bg-1 flex flex-col">
      <div className="p-2 border-b border-border flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            void search(e.target.value);
          }}
          placeholder="search files…"
          className="flex-1 bg-bg-0 border border-border rounded px-2 py-1 text-xs"
        />
        <label className="text-[10px] text-fg-2 flex items-center gap-1">
          <input type="checkbox" checked={showHidden} onChange={toggleHidden} />
          hidden
        </label>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {q && searchResults.length > 0 ? (
          <ul>
            {searchResults.map((r) => (
              <li key={r.path}>
                <button
                  type="button"
                  onClick={() => void openPreview(r.path)}
                  className="w-full text-left hover:bg-bg-2 rounded px-1 py-0.5 text-xs truncate"
                >
                  {r.relPath}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul>
            {rootEntries.map((e) => (
              <TreeNode key={e.path} entry={e} depth={0} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
