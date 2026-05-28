import { test, expect } from "./fixtures/test.js";

test("unauthenticated API call is rejected", async ({ srv, request }) => {
  const res = await request.get(`${srv.baseURL}/api/projects/recent`);
  expect(res.status()).toBe(401);
});

test("login with the wrong password shows an error and stays signed out", async ({ srv, page }) => {
  await page.goto(`${srv.baseURL}/login`);
  await page.getByLabel(/password/i).fill("totally-wrong-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("login with the correct password reaches the projects view", async ({ srv, page }) => {
  await page.goto(`${srv.baseURL}/login`);
  await page.getByLabel(/password/i).fill(srv.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: /recent projects/i })).toBeVisible();
});
