import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../src/web/lib/api.js";

beforeEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "";
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("api client", () => {
  it("unwraps the data field on a success envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, data: { n: 7 }, error: null })),
    );
    await expect(api.get<{ n: number }>("/api/x")).resolves.toEqual({ n: 7 });
  });

  it("throws ApiError carrying the error body on a failure envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            ok: false,
            data: null,
            error: { code: "bad", operation: "GET /api/x", message: "nope" },
          },
          400,
        ),
      ),
    );
    await expect(api.get("/api/x")).rejects.toMatchObject({
      name: "ApiError",
      message: "nope",
      body: { code: "bad" },
    });
    await expect(api.get("/api/x")).rejects.toBeInstanceOf(ApiError);
  });

  it("throws a plain Error on non-JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<html>500</html>", {
          status: 500,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    await expect(api.get("/api/x")).rejects.toThrow(/Non-JSON response/);
  });

  it("throws on a malformed envelope with no ok field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ surprise: true })));
    await expect(api.get("/api/x")).rejects.toThrow(/Malformed response envelope/);
  });

  it("does not send a CSRF header on GET", async () => {
    document.cookie = "arc_csrf=tok123";
    const fetchFn = vi.fn(async () => jsonResponse({ ok: true, data: 1, error: null }));
    vi.stubGlobal("fetch", fetchFn);
    await api.get("/api/x");
    const init = fetchFn.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-csrf-token"]).toBeUndefined();
    expect(init.credentials).toBe("include");
  });

  it("sends the CSRF token from the cookie on POST", async () => {
    document.cookie = "arc_csrf=tok%20123";
    const fetchFn = vi.fn(async () =>
      jsonResponse({ ok: true, data: null, error: null }),
    );
    vi.stubGlobal("fetch", fetchFn);
    await api.post("/api/x", { a: 1 });
    const [, init] = fetchFn.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-csrf-token"]).toBe("tok 123");
    expect(headers["content-type"]).toBe("application/json");
    expect((init as RequestInit).body).toBe(JSON.stringify({ a: 1 }));
  });

  it("omits content-type when POST has no body", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ ok: true, data: null, error: null }),
    );
    vi.stubGlobal("fetch", fetchFn);
    await api.post("/api/x");
    const headers = (fetchFn.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers["content-type"]).toBeUndefined();
  });
});
