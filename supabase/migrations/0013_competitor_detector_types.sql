-- Phase 3: new search_performance_detector_type values for competitor-
-- sourced opportunities. These land in the *existing*
-- search_performance_opportunities table (Phase 2D) — reusing its scoring/
-- AI-interpretation/promotion pipeline rather than a parallel table.

alter type search_performance_detector_type add value 'COMPETITOR_CONTENT_GAP';
alter type search_performance_detector_type add value 'COMPETITOR_RANKING_GAP';
alter type search_performance_detector_type add value 'SERP_FEATURE_OPPORTUNITY';
