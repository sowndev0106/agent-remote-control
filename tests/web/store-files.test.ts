import { beforeEach, describe, expect, it } from "vitest";
import { useFiles } from "../../src/web/stores/files.js";
import { mockFetchOk, resetStores } from "./helpers.js";

beforeEach(() => resetStores());

const entry = {
  name: "a.ts",
  path: "/p/a.ts",
  relPath: "a.ts",
  isDir: false,
  size: 10,
  modifiedAt: 0,
};

describe("files store", () => {
  it("setProject resets tree state and stores projectId", () => {
    useFiles.setState({
      rootEntries: [entry],
      preview: { kind: "text", relPath: "x", absPath: "x", size: 0, modifiedAt: 0 },
    });
    useFiles.getState().setProject("p1");
    const state = useFiles.getState();
    expect(state.projectId).toBe("p1");
    expect(state.rootEntries).toEqual([]);
    expect(state.preview).toBeNull();
  });

  it("loadRoot does nothing without a projectId", async () => {
    const fetchFn = mockFetchOk({ entries: [entry] });
    await useFiles.getState().loadRoot();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("loadRoot fetches the tree for the active project", async () => {
    useFiles.getState().setProject("p1");
    const fetchFn = mockFetchOk({ entries: [entry] });
    await useFiles.getState().loadRoot();
    expect(String(fetchFn.mock.calls[0]![0])).toContain("projectId=p1");
    expect(useFiles.getState().rootEntries).toHaveLength(1);
  });

  it("expand then collapse adds and removes the child list", async () => {
    useFiles.getState().setProject("p1");
    mockFetchOk({ entries: [entry] });
    await useFiles.getState().expand("/p/dir");
    expect(useFiles.getState().expanded["/p/dir"]).toHaveLength(1);
    useFiles.getState().collapse("/p/dir");
    expect("/p/dir" in useFiles.getState().expanded).toBe(false);
  });

  it("search with empty query clears results without fetching", async () => {
    useFiles.getState().setProject("p1");
    const fetchFn = mockFetchOk({ results: [] });
    await useFiles.getState().search("");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(useFiles.getState().searchResults).toEqual([]);
  });

  it("addChip dedupes by path; removeChip removes it", () => {
    useFiles.getState().addChip("a.ts", "/p/a.ts");
    useFiles.getState().addChip("a.ts", "/p/a.ts");
    expect(useFiles.getState().contextChips).toHaveLength(1);
    useFiles.getState().removeChip("/p/a.ts");
    expect(useFiles.getState().contextChips).toHaveLength(0);
  });
});
