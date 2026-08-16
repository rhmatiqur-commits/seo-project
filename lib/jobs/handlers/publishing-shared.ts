import { getPublication } from "@/lib/db/content-publications";
import { getContentVersionById, getContentBrief } from "@/lib/db/content";
import { getContentJob } from "@/lib/db/content";
import { getWebsite } from "@/lib/db/websites";
import { getCmsConnectionForWebsite, getDecryptedCredential } from "@/lib/db/cms-connections";
import { isContentApprovedForPublication } from "@/lib/publishing/eligibility";
import { resolvePublicationTargetUrl, slugFromUrl, isValidSlug } from "@/lib/publishing/url";
import { createPublishingProvider } from "@/lib/publishing/get-provider";
import { PermanentJobError } from "@/lib/jobs/types";
import type { PublishingProvider } from "@/lib/publishing/provider";
import type { ContentBrief } from "@/lib/content/brief-types";
import type { Database } from "@/lib/supabase/types";

type ContentPublicationRow = Database["public"]["Tables"]["content_publications"]["Row"];
type ContentVersionRow = Database["public"]["Tables"]["content_versions"]["Row"];
type ContentBriefRow = Database["public"]["Tables"]["content_briefs"]["Row"];
type ContentJobRow = Database["public"]["Tables"]["content_jobs"]["Row"];
type CmsConnectionRow = Database["public"]["Tables"]["cms_connections"]["Row"];

export interface PublishingContext {
  publication: ContentPublicationRow;
  version: ContentVersionRow;
  brief: ContentBriefRow;
  contentJob: ContentJobRow;
  connection: CmsConnectionRow;
  provider: PublishingProvider;
  slug: string;
  targetUrl: string;
}

/**
 * Every check here is server-side and re-run on every single job attempt —
 * "never trust a content status supplied by the browser; re-check APPROVED
 * status server-side before publishing" is implemented by never trusting
 * ANY cached value, including our own from a moment ago. Shared by both
 * CREATE_DRAFT and PUBLISH_CONTENT (lib/jobs/handlers/create-draft.ts /
 * publish-content.ts) so the validation can't drift between the two.
 * Throws PermanentJobError for anything that can never succeed on retry.
 */
export async function loadAndValidatePublishingContext(payload: { content_publication_id?: string }): Promise<PublishingContext> {
  const publicationId = payload.content_publication_id;
  if (!publicationId) throw new PermanentJobError("Job payload is missing content_publication_id");

  const publication = await getPublication(publicationId);
  if (!publication) throw new PermanentJobError(`content_publication ${publicationId} not found`);

  const version = await getContentVersionById(publication.content_version_id);
  if (!version) throw new PermanentJobError(`content_version ${publication.content_version_id} not found`);

  const contentJob = await getContentJob(version.content_job_id);
  if (!contentJob) throw new PermanentJobError(`content_job ${version.content_job_id} not found`);
  if (!isContentApprovedForPublication(contentJob.status)) {
    throw new PermanentJobError(`Content is not APPROVED (current status: ${contentJob.status}) — publication refused.`);
  }

  const brief = await getContentBrief(version.content_brief_id);
  if (!brief) throw new PermanentJobError(`content_brief ${version.content_brief_id} not found`);

  const website = await getWebsite(publication.website_id);
  if (!website) throw new PermanentJobError(`Website ${publication.website_id} not found`);
  if (website.organization_id !== publication.organization_id) {
    throw new PermanentJobError(`Website ${website.id} does not belong to organization ${publication.organization_id}`);
  }

  const connection = await getCmsConnectionForWebsite(publication.website_id);
  if (!connection) throw new PermanentJobError(`No CMS connection is configured for website ${publication.website_id}`);
  if (connection.status !== "active") {
    throw new PermanentJobError(`CMS connection for website ${publication.website_id} is not active (status: ${connection.status}) — test the connection before publishing.`);
  }

  const briefData = brief.brief_data as unknown as ContentBrief;
  const targetUrl = resolvePublicationTargetUrl({
    contentType: brief.content_type as "CREATE_NEW_PAGE" | "OPTIMISE_EXISTING_PAGE",
    existingPageUrl: briefData.existingPage?.url ?? null,
    briefTargetUrl: brief.target_url,
  });
  if (!targetUrl) throw new PermanentJobError("No target URL could be resolved for this publication (brief has neither an existing page URL nor a recommended URL).");
  const slug = slugFromUrl(targetUrl);
  if (!isValidSlug(slug)) throw new PermanentJobError(`Resolved slug "${slug}" is not a valid WordPress slug.`);

  const applicationPassword = await getDecryptedCredential(connection.credential_secret_id);
  const provider = createPublishingProvider({ provider: connection.provider, baseUrl: connection.base_url, username: connection.username, applicationPassword });

  return { publication, version, brief, contentJob, connection, provider, slug, targetUrl };
}
