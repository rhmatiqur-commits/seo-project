import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runScheduledSweep } from "@/lib/jobs/scheduler";
import { jsonError, withErrorHandling } from "@/lib/api/respond";

/**
 * Secure entrypoint for the scheduled sweep — called by the GitHub Actions
 * cron workflow (.github/workflows/scheduler.yml) today, and compatible
 * as-is with Vercel Cron later (it sends the same `Authorization: Bearer
 * $CRON_SECRET` header natively). GET and POST behave identically; GET
 * exists because Vercel Cron invokes via GET by default.
 *
 * Do not expose this without the secret — it creates and executes jobs
 * (crawls, AI calls) against every active website.
 */
function checkAuth(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${env.CRON_SECRET}`;
}

async function handle(req: NextRequest) {
  if (!checkAuth(req)) return jsonError("Unauthorized", 401);
  const summary = await runScheduledSweep();
  return NextResponse.json(summary);
}

export const POST = withErrorHandling(handle);
export const GET = withErrorHandling(handle);
