import { test as base, expect, type Page } from "@playwright/test";
import { startTestServer, type RunningServer } from "./server.js";

let server: RunningServer | null = null;

export const test = base.extend<{ srv: RunningServer }>({
  srv: async ({}, use) => {
    if (!server) server = await startTestServer();
    await use(server);
  },
});

test.afterAll(async () => {
  await server?.stop();
  server = null;
});

export async function signIn(page: Page, srv: RunningServer): Promise<void> {
  await page.goto(`${srv.baseURL}/login`);
  await page.getByLabel(/password/i).fill(srv.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByRole("heading", { name: /recent projects/i }).waitFor();
}

export async function openProject(page: Page, srv: RunningServer): Promise<void> {
  await signIn(page, srv);
  await page.getByPlaceholder(/manual path/i).fill(srv.projectDir);
  await page.getByRole("button", { name: /^add$/i }).click();
  const confirmBtn = page.getByRole("button", { name: /confirm add/i });
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
  await page.waitForURL(/\/workspace\//);
  await page.getByTestId("toggle-files").waitFor();
}

export { expect };
