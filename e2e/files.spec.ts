import { test, expect, openProject } from "./fixtures/test.js";

test("open the file explorer and preview a known file as read-only", async ({ srv, page }) => {
  await openProject(page, srv);

  await page.getByTestId("toggle-files").click();
  await page.getByTestId("file-hello.txt").click();
  await expect(page.getByText("e2e file body")).toBeVisible();
  await expect(page.getByRole("button", { name: /save|delete|rename/i })).toHaveCount(0);
});
