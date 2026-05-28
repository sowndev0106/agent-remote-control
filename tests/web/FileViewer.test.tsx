import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileViewer } from "../../src/web/components/FileViewer.js";
import { useFiles } from "../../src/web/stores/files.js";
import { renderWithRouter, resetStores } from "./helpers.js";

beforeEach(() => resetStores());

describe("FileViewer", () => {
  it("prompts to select a file when no preview is loaded", () => {
    renderWithRouter(<FileViewer />);
    expect(screen.getByText(/select a file to preview/i)).toBeInTheDocument();
  });

  it("renders text content without edit controls", () => {
    useFiles.setState({
      preview: {
        kind: "text",
        relPath: "a.ts",
        absPath: "/p/a.ts",
        size: 11,
        modifiedAt: 0,
        content: "const x = 1",
      },
    });
    renderWithRouter(<FileViewer />);
    expect(screen.getByText("const x = 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save|edit|delete|rename/i })).toBeNull();
  });

  it("shows a binary notice for binary files", () => {
    useFiles.setState({
      preview: {
        kind: "binary",
        relPath: "x.png",
        absPath: "/p/x.png",
        size: 99,
        modifiedAt: 0,
      },
    });
    renderWithRouter(<FileViewer />);
    expect(screen.getByText(/binary file/i)).toBeInTheDocument();
  });

  it("add to prompt calls addChip with rel and abs path", async () => {
    const addChip = vi.fn();
    useFiles.setState({
      preview: {
        kind: "text",
        relPath: "a.ts",
        absPath: "/p/a.ts",
        size: 1,
        modifiedAt: 0,
        content: "x",
      },
      addChip,
    });
    renderWithRouter(<FileViewer />);
    await userEvent.click(screen.getByTestId("add-to-context"));
    expect(addChip).toHaveBeenCalledWith("a.ts", "/p/a.ts");
  });
});
