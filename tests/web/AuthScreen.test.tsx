import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthScreen } from "../../src/web/components/AuthScreen.js";
import { useAuth } from "../../src/web/stores/auth.js";
import { renderWithRouter, resetStores } from "./helpers.js";

beforeEach(() => resetStores());

describe("AuthScreen", () => {
  it("disables submit until a password is typed", async () => {
    renderWithRouter(<AuthScreen />);
    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2hunter2");
    expect(button).toBeEnabled();
  });

  it("calls store.signIn with the typed password on submit", async () => {
    const signIn = vi.fn(async () => {});
    useAuth.setState({ signIn });
    renderWithRouter(<AuthScreen />);
    await userEvent.type(screen.getByLabelText(/password/i), "correct-horse-battery");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(signIn).toHaveBeenCalledWith("correct-horse-battery");
  });

  it("renders the store error in an alert region", () => {
    useAuth.setState({ error: "Bad password" });
    renderWithRouter(<AuthScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent("Bad password");
  });

  it("shows the signing-in label while pending", () => {
    useAuth.setState({ pending: true });
    renderWithRouter(<AuthScreen />);
    expect(screen.getByRole("button")).toHaveTextContent(/signing in/i);
  });
});
