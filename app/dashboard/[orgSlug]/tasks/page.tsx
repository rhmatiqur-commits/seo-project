import { requireOrganizationMembership } from "@/lib/auth/session";
import { getPrimaryWebsiteForOrganization } from "@/lib/dashboard/website";
import { listTasksForWebsite } from "@/lib/db/tasks";
import { canManageSeoWork } from "@/lib/auth/permissions";
import { updateTaskStatusAction } from "@/app/dashboard/actions";
import type { TaskStatus } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<TaskStatus, string> = { pending: "To do", in_progress: "In progress", completed: "Done", cancelled: "Cancelled" };
const STATUS_TONE: Record<TaskStatus, string> = { pending: "info", in_progress: "warning", completed: "success", cancelled: "danger" };
const STATUSES: TaskStatus[] = ["pending", "in_progress", "completed", "cancelled"];

export default async function TasksPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrganizationMembership(orgSlug);
  const website = await getPrimaryWebsiteForOrganization(organization.id);
  const tasks = website ? await listTasksForWebsite(website.id) : [];
  const canAct = canManageSeoWork(membership.role);

  return (
    <>
      <h1 className="dash-page-title">Tasks</h1>
      <p className="dash-page-subtitle">What&apos;s being worked on, and what&apos;s next.</p>

      {tasks.length === 0 && <p className="dash-empty">No tasks yet — accept an opportunity to create one.</p>}

      <table className="dash-table">
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
              <td>
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                {t.description && <div className="dash-muted" style={{ fontSize: "0.82rem" }}>{t.description}</div>}
              </td>
              <td className="dash-muted">{t.priority}</td>
              <td>
                <span className={`dash-badge ${STATUS_TONE[t.status]}`}>{STATUS_LABELS[t.status]}</span>
              </td>
              {canAct && (
                <td>
                  <form action={updateTaskStatusAction} className="dash-row" style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="org_slug" value={orgSlug} />
                    <input type="hidden" name="task_id" value={t.id} />
                    <select name="status" defaultValue={t.status} style={{ fontSize: "0.8rem" }}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <button className="dash-btn secondary" type="submit" style={{ padding: "4px 10px", fontSize: "0.8rem" }}>
                      Save
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
