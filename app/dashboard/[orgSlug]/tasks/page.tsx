import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listTasksForWebsite } from "@/lib/db/tasks";
import { canManageSeoWork } from "@/lib/auth/permissions";
import { updateTaskStatusAction } from "@/app/dashboard/actions";
import { SubmitButton } from "@/app/dashboard/_components/SubmitButton";
import { EmptyState } from "@/app/dashboard/_components/EmptyState";
import { taskStatusLabel, taskStatusTone, taskAttentionBucket, allTaskStatuses } from "@/lib/dashboard/task-status";
import { splitVisible, DEFAULT_VISIBLE_PER_GROUP } from "@/lib/dashboard/opportunity-groups";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type TaskRow = Database["public"]["Tables"]["seo_tasks"]["Row"];
const STATUSES = allTaskStatuses();

/** Phase 7.1F: extracted so "Needs your attention", "In progress", and
 * "Done" all render the exact same row shape — same convention 7.1E's
 * ContentTable helper used on the Content list. */
function TaskTable({ tasks, orgSlug, canAct }: { tasks: TaskRow[]; orgSlug: string; canAct: boolean }) {
  return (
    <div className="dash-table-wrap">
      <table className="dash-table responsive">
        <thead>
          <tr>
            <th>Task</th>
            <th>Priority</th>
            <th>Status</th>
            {canAct && <th>Update</th>}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td data-label="Task">
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                {t.description && (
                  <div className="dash-muted" style={{ fontSize: "0.82rem" }}>
                    {t.description}
                  </div>
                )}
              </td>
              <td className="dash-muted" data-label="Priority">
                {t.priority}
              </td>
              <td data-label="Status">
                <span className={`dash-badge ${taskStatusTone(t.status)}`}>{taskStatusLabel(t.status)}</span>
              </td>
              {canAct && (
                <td data-label="Update">
                  <form action={updateTaskStatusAction} className="dash-row" style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="org_slug" value={orgSlug} />
                    <input type="hidden" name="task_id" value={t.id} />
                    <select name="status" defaultValue={t.status} style={{ fontSize: "0.8rem" }}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {taskStatusLabel(s)}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="secondary" pendingLabel="Saving…" style={{ padding: "4px 10px", fontSize: "0.8rem" }}>
                      Save
                    </SubmitButton>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Phase 7.1F: reworked from a single flat, unbounded table into the same
 * attention-first pattern 7.1D (Opportunities) and 7.1E (Content) already
 * established — Tasks had the identical "wall of 78 rows" problem since
 * it's largely the same underlying opportunities, just rendered as a
 * different list, and had gone unfixed. "Needs your attention" (To do
 * tasks) is bounded with a "Show N more" disclosure
 * (lib/dashboard/opportunity-groups.ts's splitVisible, reused rather than
 * reimplemented); "In progress"/"Done" collapse behind native <details>,
 * matching Content's zero-JS approach exactly.
 *
 * The empty-state copy no longer claims tasks are created "when you accept
 * an opportunity" — per the 7.1D investigation, both promotion pipelines
 * create a task at generation time, before any human decision; accepting
 * essentially never creates a new one. Content's equivalent copy was
 * corrected in 7.1E; this is the same fix applied here.
 */
export default async function TasksPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const tasks = website ? await listTasksForWebsite(website.id) : [];
  const canAct = canManageSeoWork(membership.role);

  const needsYou = tasks.filter((t) => taskAttentionBucket(t.status) === "needs-you");
  const inProgress = tasks.filter((t) => taskAttentionBucket(t.status) === "in-progress");
  const done = tasks.filter((t) => taskAttentionBucket(t.status) === "done");
  const { visible: visibleNeedsYou, remaining } = splitVisible(needsYou, DEFAULT_VISIBLE_PER_GROUP);

  return (
    <>
      <h1 className="dash-page-title">Tasks</h1>
      <p className="dash-page-subtitle">What&apos;s being worked on, and what&apos;s next.</p>

      {tasks.length === 0 && (
        <EmptyState title="No tasks yet" description="Tasks are created automatically as new opportunities are found — you don't need to create them yourself." />
      )}

      {tasks.length > 0 && needsYou.length === 0 && (
        <p className="dash-muted" style={{ fontSize: "0.9rem" }}>
          Nothing needs your attention right now.
        </p>
      )}

      {needsYou.length > 0 && (
        <section className="dash-section">
          <h2 className="dash-subsection-heading">Needs your attention</h2>
          <TaskTable tasks={visibleNeedsYou} orgSlug={orgSlug} canAct={canAct} />
          {remaining > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--dash-text-muted)", fontWeight: 600 }}>Show {remaining} more</summary>
              <div style={{ marginTop: 10 }}>
                <TaskTable tasks={needsYou.slice(DEFAULT_VISIBLE_PER_GROUP)} orgSlug={orgSlug} canAct={canAct} />
              </div>
            </details>
          )}
        </section>
      )}

      {inProgress.length > 0 && (
        <details className="dash-section" open={needsYou.length === 0}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", color: "var(--dash-text-muted)" }}>In progress ({inProgress.length})</summary>
          <div style={{ marginTop: 10 }}>
            <TaskTable tasks={inProgress} orgSlug={orgSlug} canAct={canAct} />
          </div>
        </details>
      )}

      {done.length > 0 && (
        <details className="dash-section">
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", color: "var(--dash-text-muted)" }}>Done ({done.length})</summary>
          <div style={{ marginTop: 10 }}>
            <TaskTable tasks={done} orgSlug={orgSlug} canAct={canAct} />
          </div>
        </details>
      )}
    </>
  );
}
