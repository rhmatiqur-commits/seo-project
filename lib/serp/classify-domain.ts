import { MIN_APPEARANCES_FOR_DIRECT_COMPETITOR } from "@/lib/serp/limits";
import type { CompetitorClassification } from "@/lib/supabase/types";

/**
 * Deterministic competitor classification — no AI call for every result
 * (spec explicitly asks for this). A curated pattern list immediately
 * classifies well-known non-competitor domain types; anything else starts
 * UNKNOWN and only becomes DIRECT_COMPETITOR once it has genuinely
 * "repeatedly appeared" (see classifyCompetitorDomain). AI enrichment of the
 * remaining UNKNOWN/OTHER domains is a documented future step, not built now.
 */

const DIRECTORY_DOMAINS = ["yell.com", "checkatrade.com", "trustpilot.com", "thomsonlocal.com", "freeindex.co.uk", "reviews.io", "yelp.com", "bark.com", "cylex-uk.co.uk"];
const MARKETPLACE_DOMAINS = ["amazon.com", "amazon.co.uk", "ebay.com", "ebay.co.uk", "etsy.com", "fiverr.com", "upwork.com"];
const INFORMATIONAL_DOMAINS = ["wikipedia.org", "gov.uk", "hmrc.gov.uk", "citizensadvice.org.uk", "nhs.uk", "which.co.uk"];
// Google properties and social networks aren't real competitors, but the
// spec's own classification enum has no dedicated bucket for either — both
// fold into OTHER.
const OTHER_DOMAINS = [
  "google.com",
  "google.co.uk",
  "youtube.com",
  "maps.google.com",
  "support.google.com",
  "facebook.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "pinterest.com",
  "tiktok.com",
];

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

function matchesKnownSet(domain: string, set: string[]): boolean {
  const normalized = normalizeDomain(domain);
  return set.some((known) => normalized === known || normalized.endsWith(`.${known}`));
}

/** Immediate pattern-based classification, or null if the domain doesn't
 * match any known non-competitor pattern (meaning "let appearance-count
 * logic decide" — see classifyCompetitorDomain). */
export function classifyDomainByPattern(domain: string): CompetitorClassification | null {
  if (matchesKnownSet(domain, DIRECTORY_DOMAINS)) return "DIRECTORY";
  if (matchesKnownSet(domain, MARKETPLACE_DOMAINS)) return "MARKETPLACE";
  if (matchesKnownSet(domain, INFORMATIONAL_DOMAINS)) return "INFORMATIONAL";
  if (matchesKnownSet(domain, OTHER_DOMAINS)) return "OTHER";
  return null;
}

/**
 * Full classification: pattern match first; if none matches, a domain that
 * has appeared for at least `minAppearances` distinct keywords is a
 * DIRECT_COMPETITOR ("repeatedly appears... and is not the client's own
 * domain" — the client's own domain is never passed in here at all, it's
 * filtered out upstream via is_client_domain). Otherwise UNKNOWN — not yet
 * enough evidence either way.
 */
export function classifyCompetitorDomain(domain: string, appearances: number, minAppearances: number = MIN_APPEARANCES_FOR_DIRECT_COMPETITOR): CompetitorClassification {
  const patternMatch = classifyDomainByPattern(domain);
  if (patternMatch) return patternMatch;
  return appearances >= minAppearances ? "DIRECT_COMPETITOR" : "UNKNOWN";
}
