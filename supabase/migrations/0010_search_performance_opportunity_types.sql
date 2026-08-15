-- Phase 2D: new opportunity_type values for the SEO Decision Engine's
-- detector recommendations. Safe together in one migration — none of these
-- values are used within this same transaction.

alter type opportunity_type add value 'IMPROVE_CTR';
alter type opportunity_type add value 'INVESTIGATE_DECLINE';
alter type opportunity_type add value 'INVESTIGATE_OPPORTUNITY';
alter type opportunity_type add value 'IMPROVE_INTERNAL_LINKING';
