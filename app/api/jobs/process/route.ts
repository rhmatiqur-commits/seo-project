import { NextResponse } from "next/server";
import { processPendingJobs } from "@/lib/jobs/runner";
import { withErrorHandling } from "@/lib/api/respond";

/**
 * Manual/cron-ready fallback: processes any jobs stuck in PENDING (e.g. the
 * fire-and-forget trigger didn't run, or the process restarted mid-crawl).
 * Point a scheduler at this endpoint later instead of building a real queue now.
 */
export const POST = withErrorHandling(async () => {
  const result = await processPendingJobs();
  return NextResponse.json(result);
});
