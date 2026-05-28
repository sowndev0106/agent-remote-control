import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectPicker } from "../../src/web/components/ProjectPicker.js";
import { ApiError } from "../../src/web/lib/api.js";
import { useProjects } from "../../src/web/stores/projects.js";
import { renderWithRouter, resetStores } from "./helpers.js";

const project = {
  id: "p1",
  path: "/h/proj",
  name: "proj",
  addedAt: 1,
  lastSelectedAt: 1,
  recommendations: [],
};

beforeEach(() => resetStores());

describe("ProjectPicker", () => {
  it("lists recent projects from the store", () => {
    useProjects.setState({
      recent: [project],
      loadRecent: vi.fn(async () => {}),
      loadBrowse: vi.fn(async () => {}),
    });
    renderWithRouter(<ProjectPicker />);
    expect(screen.getByText("proj")).toBeInTheDocument();
  });

  it("shows the empty state when there are no recents", () => {
    useProjects.setState({
      recent: [],
      loadRecent: vi.fn(async () => {}),
      loadBrowse: vi.fn(async () => {}),
    });
    renderWithRouter(<ProjectPicker />);
    expect(screen.getByText(/no recent projects yet/i)).toBeInTheDocument();
  });

  it("a manual_confirm_required error switches the button to Confirm add", async () => {
    const select = vi.fn(async () => {
      throw new ApiError({
        code: "manual_confirm_required",
        operation: "POST /api/projects",
        message: "Outside roots.",
      });
    });
    useProjects.setState({
      recent: [],
      select,
      loadRecent: vi.fn(async () => {}),
      loadBrowse: vi.fn(async () => {}),
    });
    renderWithRouter(<ProjectPicker />);
    await userEvent.type(screen.getByPlaceholderText(/manual path/i), "/outside/root");
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(await screen.findByText(/outside roots/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm add/i })).toBeInTheDocument();
  });
});
