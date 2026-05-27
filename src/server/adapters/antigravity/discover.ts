import { request } from "node:http";
import type { CDPTarget } from "./cdp.js";

interface ListedTarget {
  id?: string;
  title?: string;
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export async function fetchTargetsForPort(
  port: number,
  host = "127.0.0.1",
  timeoutMs = 1_500,
): Promise<CDPTarget[]> {
  return new Promise<CDPTarget[]>((resolve) => {
    const req = request(
      { host, port, path: "/json/list", method: "GET", timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const list = JSON.parse(Buffer.concat(chunks).toString("utf8")) as ListedTarget[];
            const valid = list.filter(
              (t): t is CDPTarget =>
                typeof t.id === "string" &&
                typeof t.title === "string" &&
                typeof t.url === "string" &&
                typeof t.type === "string" &&
                typeof t.webSocketDebuggerUrl === "string",
            );
            resolve(valid);
          } catch {
            resolve([]);
          }
        });
      },
    );
    req.on("error", () => resolve([]));
    req.on("timeout", () => {
      req.destroy();
      resolve([]);
    });
    req.end();
  });
}

/**
 * Identify Antigravity workbench targets (REQ-034). Mirrors POC priority:
 *   1. URL contains `workbench.html` or title contains `workbench`
 *   2. URL contains `jetski` or title is `Launchpad`
 * Filters out devtools and shared-workers.
 */
export function isWorkbenchTarget(t: CDPTarget): boolean {
  const url = (t.url ?? "").toLowerCase();
  const title = (t.title ?? "").toLowerCase();
  if (t.type === "shared_worker" || t.type === "service_worker") return false;
  if (url.startsWith("devtools://")) return false;
  if (url.includes("workbench.html")) return true;
  if (title.includes("workbench")) return true;
  if (url.includes("jetski")) return true;
  if (title === "launchpad") return true;
  return false;
}

export interface CDPDiscoveryResult {
  port: number;
  targets: CDPTarget[];
  workbench: CDPTarget | null;
}

/**
 * Scan every configured debug port and return all candidates. Unlike the POC,
 * we return ALL discovered ports rather than the first (REQ-029A, AC-028).
 */
export async function discoverCDP(
  ports: number[],
  host = "127.0.0.1",
): Promise<CDPDiscoveryResult[]> {
  const results = await Promise.all(
    ports.map(async (port) => {
      const targets = await fetchTargetsForPort(port, host);
      return {
        port,
        targets,
        workbench: targets.find(isWorkbenchTarget) ?? null,
      };
    }),
  );
  return results.filter((r) => r.targets.length > 0);
}
