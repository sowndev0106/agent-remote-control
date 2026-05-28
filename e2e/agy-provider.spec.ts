import { test, expect, openProject } from "./fixtures/test.js";

test("launches the independent agy provider in a server-owned PTY and mirrors its output", async ({
  page,
  srv,
}) => {
  await openProject(page, srv);

  // Pick the standalone agy provider (no Antigravity/CDP involvement) and wait
  // for the selection to settle so launch fires against agy, not the default.
  await page.getByTestId("provider-agy").click();
  await expect(page.getByTestId("provider-agy")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Launch a new agy session; the selected provider is threaded into launch.
  await page.getByTestId("launch-session").click();

  // The mirror renders the agy PTY snapshot; the stub prints a marker line.
  const mirror = page.frameLocator('[data-testid="mirror-iframe"]');
  await expect(mirror.locator("body")).toContainText("AGY-STUB-ONLINE", {
    timeout: 15_000,
  });
});
