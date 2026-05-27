import { useState } from "react";
import { useSessions } from "../stores/sessions.js";
import { useFiles } from "../stores/files.js";

export function Composer({ onSlash }: { onSlash: () => void }) {
  const { active, status, sendPrompt, stop } = useSessions();
  const { contextChips, removeChip } = useFiles();
  const [text, setText] = useState("");
  const disabled = !active;

  function composeWithContext(message: string): string {
    if (contextChips.length === 0) return message;
    const ctx = contextChips.map((c) => `@${c.relPath}`).join(" ");
    return `${ctx}\n\n${message}`;
  }

  return (
    <form
      className="border-t border-border bg-bg-1 p-2 flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || disabled) return;
        try {
          await sendPrompt(composeWithContext(text));
          setText("");
        } catch {
          /* error surfaced in store */
        }
      }}
    >
      {contextChips.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="context-chips">
          {contextChips.map((c) => (
            <span
              key={c.path}
              className="text-[10px] bg-bg-3 rounded px-1.5 py-0.5 font-mono flex items-center gap-1"
            >
              {c.relPath}
              <button
                type="button"
                onClick={() => removeChip(c.path)}
                className="text-fg-2 hover:text-danger"
                aria-label="remove chip"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
      <button
        type="button"
        onClick={onSlash}
        className="text-xs bg-bg-2 border border-border rounded px-2 py-1"
        title="Slash commands (press /)"
      >
        /
      </button>
      <textarea
        rows={2}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "/" && text === "") {
            e.preventDefault();
            onSlash();
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
          }
        }}
        placeholder={
          disabled ? "Attach a session to send prompts" : "Send a message…"
        }
        className="flex-1 bg-bg-0 border border-border rounded px-2 py-1.5 text-sm resize-none font-sans focus:border-accent outline-none disabled:opacity-50"
      />
      <div className="flex flex-col gap-1">
        <button
          type="submit"
          disabled={disabled || !text.trim() || status === "generating"}
          className="text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded px-3 py-1"
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => void stop()}
          disabled={disabled || status !== "generating"}
          className="text-xs bg-bg-2 border border-border rounded px-3 py-1 disabled:opacity-50"
        >
          Stop
        </button>
      </div>
      </div>
    </form>
  );
}
