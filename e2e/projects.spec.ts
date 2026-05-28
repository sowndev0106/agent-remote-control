import { test, expect, signIn } from "./fixtures/test.js";

test("add a project by manual path and land in its workspace", async ({ srv, page }) => {
  await signIn(page, srv);
  await page.getByPlaceholder(/manual path/i).fill(srv.projectDir);
  await page.getByRole("button", { name: /^add$/i }).click();
  const confirmBtn = page.getByRole("button", { name: /confirm add/i });
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
  await expect(page).toHaveURL(/\/workspace\//);
});

test("the added project appears in recent projects after reload", async ({ srv, page }) => {
  await signIn(page, srv);
  const name = srv.projectDir.split("/").pop()!;
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
});
