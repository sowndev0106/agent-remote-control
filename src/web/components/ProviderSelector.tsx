import { useEffect } from "react";
import { useProviders } from "../stores/providers.js";
import type { ProviderId } from "../stores/types.js";

interface Props {
  active: ProviderId | undefined;
  onSelect: (id: ProviderId) => void;
}

export function ProviderSelector({ active, onSelect }: Props) {
  const { providers, load } = useProviders();
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex flex-wrap gap-2">
      {providers.map((p) => {
        const disabled = !p.enabled;
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(p.id)}
            aria-pressed={active === p.id}
            aria-disabled={disabled}
            className={
              "px-3 py-1.5 rounded border text-xs flex items-center gap-2 " +
              (disabled
                ? "border-border bg-bg-2 text-fg-2 cursor-not-allowed"
                : active === p.id
                ? "border-accent bg-accent text-white"
                : "border-border bg-bg-2 text-fg-0 hover:border-accent")
            }
            data-testid={`provider-${p.id}`}
            title={p.note}
          >
            <span>{p.displayName}</span>
            <span
              className={
                "text-[10px] rounded px-1 " +
                (p.enabled ? "bg-ok/20 text-ok" : "bg-bg-3 text-fg-2")
              }
            >
              {p.enabled ? "enabled" : p.status === "future" ? "future" : "off"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
