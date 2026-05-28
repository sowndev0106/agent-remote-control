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
  await page.getByText(/recent projects/i).waitFor();
}

export { expect };
