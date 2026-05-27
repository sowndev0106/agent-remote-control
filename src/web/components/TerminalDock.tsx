import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { api } from "../lib/api.js";
import "@xterm/xterm/css/xterm.css";

interface TabMeta {
  id: string;
  title: string;
  projectPath: string;
  cols: number;
  rows: number;
  alive: boolean;
}

/** A single xterm instance bound to a tab's WS stream. Kept out of React state
 *  (perf rule): the Terminal lives in a ref, mounted once per tab. */
function TabView({ tab, active }: { tab: TabMeta; active: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const term = new Terminal({
      fontSize: 13,
      fontFamily: "ui-monospace, Menlo, Consolas, monospace",
      theme: { background: "#0b0d10", foreground: "#eaeef3" },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${location.host}/api/terminal/tabs/${tab.id}/stream`,
    );
    wsRef.current = ws;
    ws.onmessage = (ev) => term.write(ev.data);
    term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });
    term.onResize(({ cols, rows }) => {
      void api.post(`/api/terminal/tabs/${tab.id}/resize`, { cols, rows });
    });

    const onWinResize = () => fit.fit();
    window.addEventListener("resize", onWinResize);

    return () => {
      window.removeEventListener("resize", onWinResize);
      ws.close();
      term.dispose();
      termRef.current = null;
    };
  }, [tab.id]);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => fitRef.current?.fit());
    }
  }, [active]);

  return (
    <div
      ref={hostRef}
      data-testid={`terminal-${tab.id}`}
      className="h-full w-full"
      style={{ display: active ? "block" : "none" }}
    />
  );
}

export function TerminalDock({ projectId }: { projectId: string }) {
  const [tabs, setTabs] = useState<TabMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await api.get<{ tabs: TabMeta[] }>("/api/terminal/tabs");
    setTabs(data.tabs);
    if (!activeId && data.tabs.length > 0) setActiveId(data.tabs[0]!.id);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function newTab() {
    try {
      const { tab } = await api.post<{ tab: TabMeta }>("/api/terminal/tabs", {
        projectId,
      });
      setTabs((t) => [...t, tab]);
      setActiveId(tab.id);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function closeTab(id: string) {
    try {
      await api.delete(`/api/terminal/tabs/${id}`);
    } catch (err) {
      const e = err as { body?: { code?: string } };
      if (e.body?.code === "foreground_job_running") {
        if (confirm("A foreground process is running. Close anyway?")) {
          await api.delete(`/api/terminal/tabs/${id}?force=true`);
        } else {
          return;
        }
      } else {
        throw err;
      }
    }
    setTabs((t) => t.filter((x) => x.id !== id));
    if (activeId === id) setActiveId(null);
  }

  return (
    <div className="border-t border-border bg-bg-1 flex flex-col" style={{ height: collapsed ? 32 : 240 }}>
      <div className="h-8 flex items-center gap-1 px-2 border-b border-border text-xs">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-fg-2 px-1"
        >
          {collapsed ? "▴" : "▾"} terminal
        </button>
        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          {tabs.map((t) => (
            <span key={t.id} className="flex items-center">
              <button
                type="button"
                onClick={() => setActiveId(t.id)}
                className={
                  "px-2 py-0.5 rounded text-xs " +
                  (activeId === t.id ? "bg-bg-3" : "hover:bg-bg-2 text-fg-2")
                }
              >
                {t.title} {!t.alive && "(exited)"}
              </button>
              <button
                type="button"
                onClick={() => void closeTab(t.id)}
                className="text-fg-2 hover:text-danger px-1"
                aria-label="close tab"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void newTab()}
          data-testid="new-terminal-tab"
          className="text-xs bg-accent text-white rounded px-2 py-0.5"
        >
          + tab
        </button>
      </div>
      {error && <div className="text-danger text-xs px-2 py-1">{error}</div>}
      {!collapsed && (
        <div className="flex-1 min-h-0 relative">
          {tabs.map((t) => (
            <TabView key={t.id} tab={t} active={activeId === t.id} />
          ))}
          {tabs.length === 0 && (
            <div className="h-full grid place-items-center text-fg-2 text-xs">
              No terminal tabs. Click “+ tab”.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
