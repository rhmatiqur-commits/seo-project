"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createOrganization } from "@/lib/db/organizations";
import { createWebsite } from "@/lib/db/websites";
import { updateTaskStatus } from "@/lib/db/tasks";
import { triggerJob } from "@/lib/jobs/trigger";
import type { TaskStatus } from "@/lib/supabase/types";

export async function createOrganizationAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Organization name is required");
  await createOrganization(name);
  revalidatePath("/admin");
}

export async function createWebsiteAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organization_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const baseUrl = String(formData.get("base_url") ?? "").trim();
  const maxPages = Number(formData.get("crawl_max_pages") ?? 50) || 50;
  const maxDepth = Number(formData.get("crawl_max_depth") ?? 4) || 4;
  if (!organizationId || !name || !baseUrl) throw new Error("Missing required fields");

  await createWebsite({
    organization_id: organizationId,
    name,
    base_url: baseUrl,
    crawl_max_pages: maxPages,
    crawl_max_depth: maxDepth,
  });
  redirect(`/admin/organizations/${organizationId}`);
}

async function triggerAndReturn(
  websiteId: string,
  organizationId: string,
  jobType: "CRAWL_WEBSITE" | "RUN_SEO_AUDIT" | "GENERATE_SEO_OPPORTUNITIES"
) {
  await triggerJob({
    organizationId,
    websiteId,
    jobType,
    idempotencyKey: `${jobType}:${websiteId}`,
  });
  revalidatePath(`/admin/websites/${websiteId}`);
}

export async function triggerCrawlAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  await triggerAndReturn(websiteId, organizationId, "CRAWL_WEBSITE");
  redirect(`/admin/websites/${websiteId}`);
}

export async function triggerAuditAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  await triggerAndReturn(websiteId, organizationId, "RUN_SEO_AUDIT");
  redirect(`/admin/websites/${websiteId}`);
}

export async function triggerOpportunitiesAction(formData: FormData): Promise<void> {
  const websiteId = String(formData.get("website_id"));
  const organizationId = String(formData.get("organization_id"));
  await triggerAndReturn(websiteId, organizationId, "GENERATE_SEO_OPPORTUNITIES");
  redirect(`/admin/websites/${websiteId}`);
}

export async function updateTaskStatusAction(formData: FormData): Promise<void> {
  const taskId = String(formData.get("task_id"));
  const websiteId = String(formData.get("website_id"));
  const status = String(formData.get("status")) as TaskStatus;
  await updateTaskStatus(taskId, status);
  redirect(`/admin/websites/${websiteId}`);
}
