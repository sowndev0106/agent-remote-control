import { beforeEach, describe, expect, it } from "vitest";
import { useAuth } from "../../src/web/stores/auth.js";
import { mockFetchErr, mockFetchOk, resetStores } from "./helpers.js";

beforeEach(() => resetStores());

describe("auth store", () => {
  it("checkSession sets signedIn=true on a 200 whoami", async () => {
    mockFetchOk({ user: "owner" });
    await useAuth.getState().checkSession();
    expect(useAuth.getState().signedIn).toBe(true);
  });

  it("checkSession sets signedIn=false when whoami rejects", async () => {
    mockFetchErr({ code: "auth_required", operation: "GET", message: "no" }, 401);
    await useAuth.getState().checkSession();
    expect(useAuth.getState().signedIn).toBe(false);
  });

  it("signIn success flips signedIn and clears pending", async () => {
    mockFetchOk(null);
    await useAuth.getState().signIn("correct-horse-battery");
    const state = useAuth.getState();
    expect(state.signedIn).toBe(true);
    expect(state.pending).toBe(false);
    expect(state.error).toBeNull();
  });

  it("signIn failure surfaces the ApiError message and rethrows", async () => {
    mockFetchErr(
      { code: "invalid_credentials", operation: "POST", message: "Bad password" },
      401,
    );
    await expect(useAuth.getState().signIn("wrong")).rejects.toThrow();
    const state = useAuth.getState();
    expect(state.signedIn).toBe("unknown");
    expect(state.pending).toBe(false);
    expect(state.error).toBe("Bad password");
  });

  it("signOut clears state even if the request fails", async () => {
    useAuth.setState({ signedIn: true });
    mockFetchErr({ code: "x", operation: "POST", message: "boom" }, 500);
    await useAuth.getState().signOut();
    expect(useAuth.getState().signedIn).toBe(false);
  });
});
