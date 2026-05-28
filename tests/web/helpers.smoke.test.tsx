import { beforeEach, describe, expect, it } from "vitest";
import { renderWithRouter, resetStores } from "./helpers.js";

beforeEach(() => resetStores());

describe("web test helpers", () => {
  it("renders a trivial element inside the router", () => {
    const { getByText } = renderWithRouter(<div>hello-helper</div>);
    expect(getByText("hello-helper")).toBeInTheDocument();
  });
});
