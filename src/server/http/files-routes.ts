import type { AppInstance } from "../core/app.js";
import { okEnvelope, errEnvelope, AppError } from "../core/errors.js";
import { FilesService, type FilesConfig } from "../domains/files.js";
import type { ProjectStore } from "../domains/projects.js";
import type { AppConfig } from "../core/config.js";

interface Deps {
  projects: ProjectStore;
  config: AppConfig;
}

function filesConfig(config: AppConfig): FilesConfig {
  return {
    ignore: config.fileExplorer.ignore,
    showHiddenDefault: config.fileExplorer.showHidden,
    maxPreviewBytes: config.fileExplorer.maxPreviewBytes,
  };
}

function serviceForProject(
  deps: Deps,
  projectId: string | undefined,
): FilesService {
  if (!deps.config.fileExplorer.enabled) {
    throw new AppError({
      code: "files_disabled",
      operation: "files",
      message: "File explorer is disabled in config.",
      httpStatus: 409,
    });
  }
  if (!projectId) {
    throw new AppError({
      code: "project_required",
      operation: "files",
      message: "Query must include `projectId`.",
      httpStatus: 400,
    });
  }
  const project = deps.projects.get(projectId);
  if (!project) {
    throw new AppError({
      code: "project_not_found",
      operation: "files",
      message: "Unknown project.",
      httpStatus: 404,
    });
  }
  return new FilesService(project.path, filesConfig(deps.config));
}

export function registerFilesRoutes(app: AppInstance, deps: Deps): void {
  app.get<{
    Querystring: { projectId?: string; path?: string; showHidden?: string };
  }>("/api/files/tree", async (req, reply) => {
    const svc = serviceForProject(deps, req.query.projectId);
    const project = deps.projects.get(req.query.projectId!)!;
    const path = req.query.path ?? project.path;
    const showHidden = req.query.showHidden === "true";
    const tree = await svc.tree(path, showHidden);
    reply.send(okEnvelope(tree));
  });

  app.get<{
    Querystring: { projectId?: string; path?: string };
  }>("/api/files/preview", async (req, reply) => {
    const svc = serviceForProject(deps, req.query.projectId);
    if (!req.query.path) {
      reply.code(400).send(
        errEnvelope(
          new AppError({
            code: "path_required",
            operation: "files.preview",
            message: "Query must include `path`.",
          }),
        ),
      );
      return;
    }
    const preview = await svc.preview(req.query.path);
    reply.send(okEnvelope(preview));
  });

  app.get<{
    Querystring: { projectId?: string; q?: string };
  }>("/api/files/search", async (req, reply) => {
    const svc = serviceForProject(deps, req.query.projectId);
    const results = await svc.search(req.query.q ?? "");
    reply.send(okEnvelope({ results }));
  });
}
