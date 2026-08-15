import { env } from "@/lib/env";
import { DataForSeoError, mapDataForSeoError } from "@/lib/dataforseo/errors";

export { DataForSeoError, mapDataForSeoError };
export type { DataForSeoErrorKind } from "@/lib/dataforseo/errors";

/**
 * Shared low-level DataForSEO HTTP client — hand-rolled `fetch`, no SDK, same
 * philosophy as the crawler and lib/search-console/*. Both
 * lib/serp/dataforseo-serp-provider.ts and lib/keywords/dataforseo-provider.ts
 * use this one auth/envelope-unwrapping implementation instead of each
 * rolling their own.
 *
 * Never logs DATAFORSEO_LOGIN/PASSWORD — only ever the resulting error
 * message (status code + provider-supplied status_message), which DataForSEO
 * never echoes credentials into.
 */

const API_BASE = "https://api.dataforseo.com";

function requireCredentials(): { login: string; password: string } {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    throw new DataForSeoError("DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are not configured on the server.", "not_configured");
  }
  return { login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD };
}

export interface DataForSeoTaskResult<T> {
  statusCode: number;
  statusMessage: string;
  result: T[];
  cost: number;
}

/**
 * Posts a single-task request to a DataForSEO "live" endpoint (result
 * returned inline — no separate task-get poll needed) and unwraps its task
 * envelope. Throws DataForSeoError on any failure.
 */
export async function dataforseoPost<T>(path: string, body: Record<string, unknown>): Promise<DataForSeoTaskResult<T>> {
  const { login, password } = requireCredentials();
  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify([body]),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new DataForSeoError(`DataForSEO request failed: ${error instanceof Error ? error.message : String(error)}`, "transient");
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw mapDataForSeoError(res.status, json?.status_code, json?.status_message);
  }

  const task = json.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw mapDataForSeoError(res.status, task?.status_code ?? json.status_code, task?.status_message ?? json.status_message);
  }

  return {
    statusCode: task.status_code,
    statusMessage: task.status_message,
    result: (task.result ?? []) as T[],
    cost: typeof task.cost === "number" ? task.cost : 0,
  };
}
