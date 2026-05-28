import { beforeEach, describe, expect, it } from "vitest";
import { useProjects } from "../../src/web/stores/projects.js";
import {
  mockFetchErr,
  mockFetchOk,
  mockFetchRoutes,
  resetStores,
} from "./helpers.js";

beforeEach(() => resetStores());

const project = {
  id: "p1",
  path: "/home/u/proj",
  name: "proj",
  addedAt: 1,
  lastSelectedAt: 1,
  recommendations: [],
};

describe("projects store", () => {
  it("loadRecent fills recent and clears loading", async () => {
    mockFetchOk({ projects: [project] });
    await useProjects.getState().loadRecent();
    const state = useProjects.getState();
    expect(state.recent).toHaveLength(1);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("loadRecent records the error message on failure", async () => {
    mockFetchErr({ code: "x", operation: "GET", message: "down" }, 500);
    await useProjects.getState().loadRecent();
    expect(useProjects.getState().error).toBe("down");
    expect(useProjects.getState().loading).toBe(false);
  });

  it("loadBrowse stores the browse result", async () => {
    const browse = { path: "/h", parent: null, roots: ["/h"], entries: [] };
    mockFetchOk(browse);
    await useProjects.getState().loadBrowse("/h", true);
    expect(useProjects.getState().browse).toEqual(browse);
  });

  it("select posts the path, reloads recent, and sets active", async () => {
    const fetchFn = mockFetchRoutes([
      { match: "/api/projects/recent", data: { projects: [project] } },
      { match: "/api/projects", data: { project } },
    ]);
    const result = await useProjects.getState().select("/home/u/proj", true);
    expect(result.id).toBe("p1");
    expect(useProjects.getState().active?.id).toBe("p1");
    const postCall = fetchFn.mock.calls.find(
      (call) => (call[1] as RequestInit)?.method === "POST",
    )!;
    expect((postCall[1] as RequestInit).body).toContain("confirmManual");
  });

  it("remove clears active when the removed id was active", async () => {
    useProjects.setState({ active: project });
    mockFetchRoutes([
      { match: "DELETE:/api/projects/p1", data: null },
      { match: "/api/projects/recent", data: { projects: [] } },
    ]);
    await useProjects.getState().remove("p1");
    expect(useProjects.getState().active).toBeNull();
  });
});
