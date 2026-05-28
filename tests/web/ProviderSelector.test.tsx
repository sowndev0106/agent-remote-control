import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderSelector } from "../../src/web/components/ProviderSelector.js";
import { useProviders } from "../../src/web/stores/providers.js";
import { renderWithRouter, resetStores } from "./helpers.js";

const providers = [
  {
    id: "antigravity",
    displayName: "Antigravity",
    enabled: true,
    available: true,
    status: "ready",
    capabilities: {},
  },
  {
    id: "claude",
    displayName: "Claude",
    enabled: false,
    available: false,
    status: "future",
    capabilities: {},
  },
];

beforeEach(() => resetStores());

describe("ProviderSelector", () => {
  it("renders disabled providers visible-and-disabled, not hidden", () => {
    useProviders.setState({ providers, load: vi.fn(async () => {}) });
    renderWithRouter(<ProviderSelector active="antigravity" onSelect={() => {}} />);
    expect(screen.getByTestId("provider-claude")).toBeDisabled();
    expect(screen.getByTestId("provider-claude")).toBeInTheDocument();
    expect(screen.getByText("future")).toBeInTheDocument();
  });

  it("marks the active provider with aria-pressed", () => {
    useProviders.setState({ providers, load: vi.fn(async () => {}) });
    renderWithRouter(<ProviderSelector active="antigravity" onSelect={() => {}} />);
    expect(screen.getByTestId("provider-antigravity")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("selecting an enabled provider calls onSelect with its id", async () => {
    useProviders.setState({ providers, load: vi.fn(async () => {}) });
    const onSelect = vi.fn();
    renderWithRouter(<ProviderSelector active={undefined} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId("provider-antigravity"));
    expect(onSelect).toHaveBeenCalledWith("antigravity");
  });
});
