import { type ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { useAuth } from "../../src/web/stores/auth.js";
import { useFiles } from "../../src/web/stores/files.js";
import { useProjects } from "../../src/web/stores/projects.js";
import { useProviders } from "../../src/web/stores/providers.js";
import { useSessions } from "../../src/web/stores/sessions.js";

/** Render a component inside a MemoryRouter at `route`. */
export function renderWithRouter(ui: ReactElement, route = "/") {
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      {ui}
    </MemoryRouter>,
  );
}

/** Reset every Zustand singleton to its initial values. Call in beforeEach. */
export function resetStores(): void {
  useAuth.setState(useAuth.getInitialState(), true);
  useProjects.setState(useProjects.getInitialState(), true);
  useSessions.setState(useSessions.getInitialState(), true);
  useFiles.setState(useFiles.getInitialState(), true);
  useProviders.setState(useProviders.getInitialState(), true);
}

/** Stub global fetch to return one JSON body wrapped in the success envelope. */
export function mockFetchOk<T>(data: T): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify({ ok: true, data, error: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Stub global fetch to return the error envelope with the given status. */
export function mockFetchErr(
  error: { code: string; operation: string; message: string },
  status = 400,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify({ ok: false, data: null, error }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Route fetch by URL substring -> success-enveloped data. Order matters. */
export function mockFetchRoutes(
  routes: Array<{ match: string; method?: string; data: unknown }>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const requestMethod = String(init?.method ?? "GET").toUpperCase();
    const requestUrl = String(url);
    const hit = routes.find((route) => {
      const [maybeMethod, maybePath] = route.match.split(/:(.+)/);
      const method = route.method?.toUpperCase()
        ?? (maybePath && /^[A-Z]+$/.test(maybeMethod) ? maybeMethod : undefined);
      const match = method ? maybePath : route.match;
      return (!method || method === requestMethod) && requestUrl.includes(match);
    });
    const body = hit
      ? { ok: true, data: hit.data, error: null }
      : {
          ok: false,
          data: null,
          error: { code: "not_found", operation: requestMethod, message: "no route" },
        };
    return new Response(JSON.stringify(body), {
      status: hit ? 200 : 404,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
