import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useProjects } from "../stores/projects.js";
import { useSessions } from "../stores/sessions.js";
import { useProviders } from "../stores/providers.js";
import { MirrorTimeline } from "./MirrorTimeline.js";
import { ActionPanel } from "./ActionPanel.js";
import { Composer } from "./Composer.js";
import { ProviderSelector } from "./ProviderSelector.js";
import { SessionDiscoveryList } from "./SessionDiscoveryList.js";
import { SlashCommandPalette } from "./SlashCommandPalette.js";
import type { ProviderId } from "../stores/types.js";

export function Workspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const { active, setActive, setLastProvider } = useProjects();
  const { active: session } = useSessions();
  const { providers, load: loadProviders } = useProviders();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (projectId) void setActive(projectId);
  }, [projectId, setActive]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "TEXTAREA"
          && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!active) {
    return (
      <div className="p-4 text-fg-2 text-sm">
        Loading project… (or it was removed.)
      </div>
    );
  }

  const activeProvider =
    (active.lastProviderId as ProviderId | undefined) ??
    (providers.find((p) => p.enabled)?.id as ProviderId | undefined);

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border bg-bg-1 px-3 py-2 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-medium truncate">{active.name}</div>
          <div className="text-[10px] text-fg-2 font-mono truncate">{active.path}</div>
        </div>
        <div className="md:ml-4">
          <ProviderSelector
            active={activeProvider}
            onSelect={(id) => {
              void setLastProvider(active.id, id);
            }}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <div className="flex-1 min-w-0 flex flex-col">
          {!session && (
            <div className="p-3">
              <SessionDiscoveryList projectId={active.id} />
            </div>
          )}
          {session && <MirrorTimeline />}
          <Composer onSlash={() => setPaletteOpen(true)} />
        </div>
        <ActionPanel />
      </div>

      <SlashCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
