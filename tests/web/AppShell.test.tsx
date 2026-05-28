import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "../../src/web/components/AppShell.js";
import { useAuth } from "../../src/web/stores/auth.js";
import { renderWithRouter, resetStores } from "./helpers.js";

beforeEach(() => resetStores());

function shellAt(route: string) {
  return renderWithRouter(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<div>home-outlet</div>} />
        <Route path="/settings" element={<div>settings-outlet</div>} />
      </Route>
    </Routes>,
    route,
  );
}

describe("AppShell", () => {
  it("renders the nav and the routed outlet", () => {
    shellAt("/");
    expect(screen.getByText("home-outlet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /projects/i })).toBeInTheDocument();
  });

  it("sign out calls the auth store", async () => {
    const signOut = vi.fn(async () => {});
    useAuth.setState({ signOut });
    shellAt("/");
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });
});
