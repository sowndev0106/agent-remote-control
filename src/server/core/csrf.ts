import { randomBytes, timingSafeEqual } from "node:crypto";

export const CSRF_COOKIE = "arc_csrf";
export const CSRF_HEADER = "x-csrf-token";

export function issueCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function verifyCsrfToken(
  cookieToken: string | undefined,
  headerToken: string | undefined,
): boolean {
  if (!cookieToken || !headerToken) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
