import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { Workspace } from "../../src/web/components/Workspace.js";
import { useProjects } from "../../src/web/stores/projects.js";
import { useProviders } from "../../src/web/stores/providers.js";
import { useSessions } from "../../src/web/stores/sessions.js";
import { mockFetchOk, renderWithRouter, resetStores } from "./helpers.js";

const project = {
  id: "p1",
  path: "/h/proj",
  name: "My Project",
  addedAt: 1,
  lastSelectedAt: 1,
  recommendations: [],
};

beforeEach(() => {
  resetStores();
  vi.useFakeTimers();
  mockFetchOk({});
});
afterEach(() => vi.useRealTimers());

function renderWorkspace() {
  return renderWithRouter(
    <Routes>
      <Route path="/workspace/:projectId" element={<Workspace />} />
    </Routes>,
    "/workspace/p1",
  );
}

function seedWorkspace(projectActive = project) {
  useProjects.setState({
    active: projectActive,
    setActive: vi.fn(async () => {}),
    setLastProvider: vi.fn(async () => {}),
  });
  useProviders.setState({
    load: vi.fn(async () => {}),
    providers: [
      {
        id: "antigravity",
        displayName: "Antigravity",
        enabled: true,
        available: true,
        status: "ready",
        capabilities: {},
      },
    ],
  });
  useSessions.setState({ discover: vi.fn(async () => {}) });
}

describe("Workspace", () => {
  it("shows the loading state until the active project resolves", () => {
    useProjects.setState({ setActive: vi.fn(async () => {}) });
    useProviders.setState({ load: vi.fn(async () => {}) });
    renderWorkspace();
    expect(screen.getByText(/loading project/i)).toBeInTheDocument();
  });

  it("renders the project header and provider selector once active", () => {
    seedWorkspace();
    renderWorkspace();
    expect(screen.getByText("My Project")).toBeInTheDocument();
    expect(screen.getByTestId("provider-antigravity")).toBeInTheDocument();
  });

  it("toggle-files and toggle-terminal buttons are present", () => {
    seedWorkspace();
    renderWorkspace();
    expect(screen.getByTestId("toggle-files")).toBeInTheDocument();
    expect(screen.getByTestId("toggle-terminal")).toBeInTheDocument();
  });

  it("with no active session it shows the discovery list", () => {
    seedWorkspace();
    useSessions.setState({ active: null, discover: vi.fn(async () => {}) });
    renderWorkspace();
    expect(screen.getByText(/discovered antigravity sessions/i)).toBeInTheDocument();
  });
});
