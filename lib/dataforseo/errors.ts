/**
 * Pure error classification, deliberately kept free of any `@/lib/env`
 * import (which validates process.env at module load) so it stays testable
 * without a full env setup — same reasoning lib/search-console/state.ts
 * follows by taking `secret` as a parameter instead of reading env directly.
 */

export type DataForSeoErrorKind = "not_configured" | "auth" | "transient" | "permanent";

export class DataForSeoError extends Error {
  readonly kind: DataForSeoErrorKind;
  constructor(message: string, kind: DataForSeoErrorKind) {
    super(message);
    this.name = "DataForSeoError";
    this.kind = kind;
  }
}

/**
 * Classifies an HTTP status + DataForSEO's own envelope status_code into
 * retry-worthy ("transient") vs not ("auth"/"permanent") — a best-effort
 * mapping (DataForSEO doesn't publish an exhaustive numeric error taxonomy),
 * biased toward "permanent" for anything request/auth-shaped so the existing
 * job retry policy (lib/jobs/policy.ts) doesn't burn its limited retry
 * budget on something that will never succeed.
 */
export function mapDataForSeoError(httpStatus: number, envelopeStatusCode?: number, envelopeStatusMessage?: string): DataForSeoError {
  if (httpStatus === 401 || httpStatus === 403) {
    return new DataForSeoError(`DataForSEO authentication failed (HTTP ${httpStatus}). Check DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD.`, "auth");
  }
  if (httpStatus === 429 || httpStatus >= 500) {
    return new DataForSeoError(`DataForSEO transient error (HTTP ${httpStatus}${envelopeStatusMessage ? `: ${envelopeStatusMessage}` : ""}).`, "transient");
  }
  if (envelopeStatusCode !== undefined && envelopeStatusCode >= 40000 && envelopeStatusCode < 50000) {
    // DataForSEO's 4xxxx range is generally request/auth-shaped — treat as permanent.
    return new DataForSeoError(`DataForSEO request error (status ${envelopeStatusCode}: ${envelopeStatusMessage ?? "unknown"}).`, "permanent");
  }
  return new DataForSeoError(`DataForSEO error (HTTP ${httpStatus}${envelopeStatusMessage ? `: ${envelopeStatusMessage}` : ""}).`, "permanent");
}
