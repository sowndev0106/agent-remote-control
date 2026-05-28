import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileExplorer } from "../../src/web/components/FileExplorer.js";
import { useFiles } from "../../src/web/stores/files.js";
import { renderWithRouter, resetStores } from "./helpers.js";

const root = [
  { name: "src", path: "/p/src", relPath: "src", isDir: true, size: 0, modifiedAt: 0 },
  {
    name: "readme.md",
    path: "/p/readme.md",
    relPath: "readme.md",
    isDir: false,
    size: 5,
    modifiedAt: 0,
  },
];

beforeEach(() => resetStores());

describe("FileExplorer", () => {
  it("renders the root entries from the store", () => {
    useFiles.setState({
      rootEntries: root,
      loadRoot: vi.fn(async () => {}),
      setProject: vi.fn(),
    });
    renderWithRouter(<FileExplorer projectId="p1" />);
    expect(screen.getByTestId("file-src")).toBeInTheDocument();
    expect(screen.getByTestId("file-readme.md")).toBeInTheDocument();
  });

  it("clicking a file opens its preview", async () => {
    const openPreview = vi.fn(async () => {});
    useFiles.setState({
      rootEntries: root,
      openPreview,
      loadRoot: vi.fn(async () => {}),
      setProject: vi.fn(),
    });
    renderWithRouter(<FileExplorer projectId="p1" />);
    await userEvent.click(screen.getByTestId("file-readme.md"));
    expect(openPreview).toHaveBeenCalledWith("/p/readme.md");
  });

  it("clicking a directory expands it", async () => {
    const expand = vi.fn(async () => {});
    useFiles.setState({
      rootEntries: root,
      expand,
      loadRoot: vi.fn(async () => {}),
      setProject: vi.fn(),
    });
    renderWithRouter(<FileExplorer projectId="p1" />);
    await userEvent.click(screen.getByTestId("file-src"));
    expect(expand).toHaveBeenCalledWith("/p/src");
  });

  it("typing in search calls store.search with the query", async () => {
    const search = vi.fn(async () => {});
    useFiles.setState({
      rootEntries: root,
      search,
      loadRoot: vi.fn(async () => {}),
      setProject: vi.fn(),
    });
    renderWithRouter(<FileExplorer projectId="p1" />);
    await userEvent.type(screen.getByPlaceholderText(/search files/i), "rea");
    expect(search).toHaveBeenLastCalledWith("rea");
  });
});
