export interface OkEnvelope<T> { ok: true; data: T; error: null }
export interface ErrEnvelope { ok: false; data: null; error: ErrorBody }
export type Envelope<T> = OkEnvelope<T> | ErrEnvelope;

export interface ErrorBody {
  code: string;
  operation: string;
  message: string;
  detail?: string;
  recoveryAction?: string;
}

/** Read CSRF token from the (non-HttpOnly) cookie. */
function csrfToken(): string {
  const m = document.cookie.split(";").map((s) => s.trim()).find((c) => c.startsWith("arc_csrf="));
  return m ? decodeURIComponent(m.slice("arc_csrf=".length)) : "";
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") {
    const token = csrfToken();
    if (token) headers["x-csrf-token"] = token;
  }
  const res = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed: Envelope<T>;
  try {
    parsed = (await res.json()) as Envelope<T>;
  } catch {
    throw new Error(`Non-JSON response from ${method} ${url} (status ${res.status})`);
  }
  // S04-T02: reject any response that does not match the envelope
  if (typeof parsed !== "object" || parsed === null || !("ok" in parsed)) {
    throw new Error(`Malformed response envelope from ${method} ${url}`);
  }
  if (!parsed.ok) {
    const err = new ApiError(parsed.error);
    throw err;
  }
  return parsed.data;
}

export class ApiError extends Error {
  readonly body: ErrorBody;
  constructor(body: ErrorBody) {
    super(body.message);
    this.body = body;
    this.name = "ApiError";
  }
}

export const api = {
  get<T>(url: string): Promise<T> { return send<T>("GET", url); },
  post<T>(url: string, body?: unknown): Promise<T> { return send<T>("POST", url, body); },
  put<T>(url: string, body?: unknown): Promise<T> { return send<T>("PUT", url, body); },
  delete<T>(url: string): Promise<T> { return send<T>("DELETE", url); },
};
