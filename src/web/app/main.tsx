import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useAuth } from "../stores/auth.js";
import { AuthScreen } from "../components/AuthScreen.js";
import { AppShell } from "../components/AppShell.js";
import { ProjectPicker } from "../components/ProjectPicker.js";
import { Workspace } from "../components/Workspace.js";
import { SettingsView } from "../components/SettingsView.js";
import { RealtimeClient } from "../lib/ws.js";
import { useSessions } from "../stores/sessions.js";

function Protected({ children }: { children: React.ReactNode }) {
  const { signedIn, checkSession } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (signedIn === "unknown") void checkSession();
  }, [signedIn, checkSession]);
  if (signedIn === "unknown") {
    return <div className="p-4 text-fg-2 text-sm">Loading…</div>;
  }
  if (!signedIn) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

function RealtimeBridge() {
  const setSnapshot = useSessions((s) => s.setSnapshot);
  const setActions = useSessions((s) => s.setActions);

  useEffect(() => {
    const client = new RealtimeClient();
    const off = client.on((ev) => {
      if (ev.type === "provider.snapshot.changed") {
        const payload = ev.payload as { hash: string; capturedAt: number; html?: string; text?: string };
        setSnapshot(payload);
      } else if (ev.type === "provider.actions.changed") {
        const payload = ev.payload as { actions: { actionId: string; label: string; kind: "button" | "approval" | "input"; enabled: boolean }[] };
        setActions(payload.actions);
      }
    });
    client.start();
    return () => {
      off();
      client.stop();
    };
  }, [setSnapshot, setActions]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthScreen />} />
        <Route
          element={
            <Protected>
              <RealtimeBridge />
              <AppShell />
            </Protected>
          }
        >
          <Route path="/" element={<ProjectPicker />} />
          <Route path="/workspace/:projectId" element={<Workspace />} />
          <Route path="/settings" element={<SettingsView />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
