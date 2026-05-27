import { useFiles } from "../stores/files.js";

export function FileViewer() {
  const { preview, addChip } = useFiles();
  if (!preview) {
    return (
      <div className="flex-1 grid place-items-center text-fg-2 text-sm">
        Select a file to preview.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border text-xs flex items-center gap-3 flex-wrap">
        <span className="font-mono truncate">{preview.relPath}</span>
        <span className="text-fg-2">{preview.size} bytes</span>
        <span className="text-fg-2">{preview.kind}</span>
        <span className="text-fg-2">
          {new Date(preview.modifiedAt).toLocaleString()}
        </span>
        <button
          type="button"
          className="ml-auto text-[10px] bg-bg-2 border border-border rounded px-1.5 py-0.5"
          onClick={() => void navigator.clipboard?.writeText(preview.relPath)}
        >
          copy rel path
        </button>
        <button
          type="button"
          className="text-[10px] bg-bg-2 border border-border rounded px-1.5 py-0.5"
          onClick={() => void navigator.clipboard?.writeText(preview.absPath)}
        >
          copy abs path
        </button>
        <button
          type="button"
          data-testid="add-to-context"
          className="text-[10px] bg-accent text-white rounded px-1.5 py-0.5"
          onClick={() => addChip(preview.relPath, preview.absPath)}
        >
          add to prompt
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {preview.kind === "text" && (
          <pre className="text-xs font-mono p-3 whitespace-pre-wrap">
            {preview.content}
          </pre>
        )}
        {preview.kind === "binary" && (
          <div className="p-4 text-fg-2 text-sm">
            Binary file — preview not shown.
          </div>
        )}
        {preview.kind === "oversized" && (
          <div className="p-4 text-fg-2 text-sm">
            File exceeds the preview size limit.
          </div>
        )}
      </div>
    </div>
  );
}
