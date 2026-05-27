import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../stores/auth.js";

export function AuthScreen() {
  const { signIn, pending, error } = useAuth();
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  return (
    <div className="min-h-screen grid place-items-center bg-bg-0 text-fg-0 p-4">
      <form
        className="w-full max-w-sm bg-bg-1 border border-border rounded-md p-6 shadow-lg"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await signIn(password);
            navigate("/");
          } catch {
            /* error displayed below */
          }
        }}
      >
        <h1 className="text-lg font-semibold mb-4">Sign in</h1>
        <label className="block text-sm text-fg-1">
          Password
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            className="mt-1 w-full bg-bg-0 border border-border rounded px-2 py-1.5 outline-none focus:border-accent"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          disabled={pending || password.length === 0}
          className="mt-4 w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded px-3 py-1.5 text-sm"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
        {error && (
          <div className="mt-3 text-danger text-sm" role="alert">
            {error}
          </div>
        )}
        <p className="mt-4 text-xs text-fg-2">
          First run? Run <code className="font-mono">agent-remote-control install</code>{" "}
          in a terminal.
        </p>
      </form>
    </div>
  );
}
