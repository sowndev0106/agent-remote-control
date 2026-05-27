import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../stores/auth.js";

export function AppShell() {
  const { signOut } = useAuth();
  const location = useLocation();
  return (
    <div className="h-full flex flex-col">
      <header className="h-10 border-b border-border bg-bg-1 flex items-center px-3 gap-3 text-sm">
        <Link to="/" className="font-semibold text-fg-0 hover:text-accent">
          agent-remote-control
        </Link>
        <nav className="flex items-center gap-2 text-xs">
          <Link
            to="/"
            className={
              "px-2 py-0.5 rounded " +
              (location.pathname === "/" ? "bg-bg-2" : "hover:bg-bg-2")
            }
          >
            projects
          </Link>
          <Link
            to="/settings"
            className={
              "px-2 py-0.5 rounded " +
              (location.pathname.startsWith("/settings")
                ? "bg-bg-2"
                : "hover:bg-bg-2")
            }
          >
            settings
          </Link>
        </nav>
        <div className="flex-1" />
        <button
          type="button"
          className="text-xs text-fg-2 hover:text-fg-0"
          onClick={() => { void signOut(); }}
        >
          sign out
        </button>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
