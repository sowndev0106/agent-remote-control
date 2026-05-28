import { test, expect } from "./fixtures/test.js";

test("the app shell sets a strict CSP and frame guards", async ({ srv, request }) => {
  const res = await request.get(`${srv.baseURL}/login`);
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain("unsafe-eval");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-frame-options"]).toBe("SAMEORIGIN");
});

test("API responses do not carry the HTML CSP", async ({ srv, request }) => {
  const res = await request.get(`${srv.baseURL}/api/projects/recent`);
  expect(res.headers()["content-security-policy"]).toBeFalsy();
});
