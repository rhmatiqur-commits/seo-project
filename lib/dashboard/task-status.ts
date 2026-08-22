import type { TaskStatus } from "@/lib/supabase/types";

/**
 * Phase 7.1F: presentation-only helpers over seo_tasks' existing
 * `status`/`priority` columns — no new data, no schema change. Reused by
 * both the Tasks list (grouping) and the Opportunity detail page (showing
 * a non-content-eligible opportunity's linked task, if any).
 */

const STATUS_LABELS: Record<TaskStatus, string> = { pending: "To do", in_progress: "In progress", completed: "Done", cancelled: "Cancelled" };
const STATUS_TONE: Record<TaskStatus, string> = { pending: "info", in_progress: "warning", completed: "success", cancelled: "danger" };

export function taskStatusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function taskStatusTone(status: TaskStatus): string {
  return STATUS_TONE[status] ?? "neutral";
}

export function allTaskStatuses(): TaskStatus[] {
  return Object.keys(STATUS_LABELS) as TaskStatus[];
}

export type TaskAttentionBucket = "needs-you" | "in-progress" | "done";

/** "To do" is the one state a client should actually look at and decide
 * something about (reprioritise, delegate, or just note it's coming) — the
 * same "what needs a person, vs. what's just moving, vs. what's settled"
 * split Opportunities (7.1D) and Content (7.1E) already use, applied to
 * Tasks' own 4-value status instead of inventing a new taxonomy. */
export function taskAttentionBucket(status: TaskStatus): TaskAttentionBucket {
  if (status === "pending") return "needs-you";
  if (status === "in_progress") return "in-progress";
  return "done"; // completed, cancelled
}

// ---------------------------------------------------------------------------
// Opportunity -> linked task progress (non-content-eligible opportunity types)
// ---------------------------------------------------------------------------

export const OPPORTUNITY_TASK_STAGES = ["Accepted", "Task in progress", "Task completed"] as const;

export interface OpportunityTaskStageInfo {
  stageIndex: 0 | 1 | 2;
  /** True for a cancelled task — a real, terminal outcome that isn't
   * "further along" than Accepted, mirroring lib/dashboard/publication-
   * stage.ts's FAILED/UNPUBLISHED precedent exactly (same shape, same
   * "anchor at the honest point, flag the exception separately" idea). */
  cancelled: boolean;
}

/** Null input (no task exists at all) is handled by the caller as its own
 * honest "no task has been created for this opportunity yet" state — this
 * function is never asked to invent one. */
export function opportunityTaskStageInfo(status: TaskStatus): OpportunityTaskStageInfo {
  if (status === "pending") return { stageIndex: 0, cancelled: false };
  if (status === "in_progress") return { stageIndex: 1, cancelled: false };
  if (status === "completed") return { stageIndex: 2, cancelled: false };
  return { stageIndex: 0, cancelled: true }; // cancelled
}
