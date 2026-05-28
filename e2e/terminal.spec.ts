import { test, expect, openProject } from "./fixtures/test.js";

test("open a terminal tab and run a command echoing output", async ({ srv, page }) => {
  await openProject(page, srv);

  await page.getByTestId("toggle-terminal").click();
  await page.getByTestId("new-terminal-tab").click();
  await page.getByTestId(/^terminal-/).click();
  await page.keyboard.type("echo arc-e2e-marker\n");
  await expect(page.getByText(/arc-e2e-marker/)).toBeVisible({ timeout: 10_000 });
});
