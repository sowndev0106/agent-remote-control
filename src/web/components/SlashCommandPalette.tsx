import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { useSessions } from "../stores/sessions.js";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFiles?: () => void;
  onOpenTerminal?: () => void;
}

interface PaletteCmd {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
  run: () => void;
}

export function SlashCommandPalette({
  open,
  onOpenChange,
  onOpenFiles,
  onOpenTerminal,
}: Props) {
  const navigate = useNavigate();
  const { stop, newConversation, active } = useSessions();
  const close = () => onOpenChange(false);

  const cmds: PaletteCmd[] = [
    { id: "new", label: "/new", hint: "Start a new conversation",
      enabled: !!active, run: () => { void newConversation(); close(); } },
    { id: "stop", label: "/stop", hint: "Stop current generation",
      enabled: !!active, run: () => { void stop(); close(); } },
    { id: "project", label: "/project", hint: "Switch project",
      enabled: true, run: () => { navigate("/"); close(); } },
    { id: "files", label: "/files",
      hint: "Open file explorer",
      enabled: !!onOpenFiles, run: () => { onOpenFiles?.(); close(); } },
    { id: "open", label: "/open", hint: "Open file (sprint 06)",
      enabled: false, run: () => { close(); } },
    { id: "provider", label: "/provider", hint: "Switch provider",
      enabled: !!active, run: () => { close(); } },
    { id: "model", label: "/model", hint: "Pick model",
      enabled: !!active, run: () => { close(); } },
    { id: "mode", label: "/mode", hint: "Pick mode",
      enabled: !!active, run: () => { close(); } },
    { id: "history", label: "/history", hint: "Browse conversation history",
      enabled: !!active, run: () => { close(); } },
    { id: "actions", label: "/actions", hint: "Show available actions",
      enabled: !!active, run: () => { close(); } },
    { id: "terminal", label: "/terminal",
      hint: "Open terminal panel",
      enabled: !!onOpenTerminal, run: () => { onOpenTerminal?.(); close(); } },
    { id: "settings", label: "/settings", hint: "Open settings",
      enabled: true, run: () => { navigate("/settings"); close(); } },
  ];

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 grid place-items-start pt-24 z-50"
      onClick={close}
    >
      <Command
        className="bg-bg-1 border border-border rounded w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Command.Input
          autoFocus
          placeholder="Type a command…"
          className="w-full bg-bg-0 border-b border-border px-3 py-2 text-sm outline-none"
        />
        <Command.List className="max-h-80 overflow-auto p-2">
          <Command.Empty className="text-fg-2 text-xs px-2 py-1">
            No matching commands.
          </Command.Empty>
          {cmds.map((c) => (
            <Command.Item
              key={c.id}
              value={`${c.label} ${c.hint}`}
              disabled={!c.enabled}
              onSelect={() => c.enabled && c.run()}
              data-testid={`palette-cmd-${c.id}`}
              data-enabled={c.enabled}
              className={
                "flex items-center justify-between px-2 py-1.5 rounded text-sm cursor-pointer " +
                (c.enabled
                  ? "data-[selected=true]:bg-bg-2"
                  : "opacity-40 cursor-not-allowed")
              }
            >
              <span className="font-mono">{c.label}</span>
              <span className="text-xs text-fg-2">{c.hint}</span>
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
