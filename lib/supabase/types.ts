// Generated via the Supabase MCP `generate_typescript_types` tool against the
// live schema (supabase/migrations/0001-0004). Regenerate after any migration
// change and reconcile with the Tables section rather than hand-editing generated shapes.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          completed_at: string | null;
          completion_tokens: number | null;
          created_at: string;
          error: string | null;
          id: string;
          input_summary: Json;
          job_id: string | null;
          latency_ms: number | null;
          model: string;
          organization_id: string;
          prompt_tokens: number | null;
          prompt_version: string;
          provider: string;
          purpose: string;
          result: Json | null;
          status: Database["public"]["Enums"]["job_status"];
          total_tokens: number | null;
        };
        Insert: {
          completed_at?: string | null;
          completion_tokens?: number | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          input_summary?: Json;
          job_id?: string | null;
          latency_ms?: number | null;
          model: string;
          organization_id: string;
          prompt_tokens?: number | null;
          prompt_version: string;
          provider: string;
          purpose: string;
          result?: Json | null;
          status?: Database["public"]["Enums"]["job_status"];
          total_tokens?: number | null;
        };
        Update: {
          completed_at?: string | null;
          completion_tokens?: number | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          input_summary?: Json;
          job_id?: string | null;
          latency_ms?: number | null;
          model?: string;
          organization_id?: string;
          prompt_tokens?: number | null;
          prompt_version?: string;
          provider?: string;
          purpose?: string;
          result?: Json | null;
          status?: Database["public"]["Enums"]["job_status"];
          total_tokens?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_jobs_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      competitors: {
        Row: {
          created_at: string;
          domain: string | null;
          id: string;
          name: string;
          notes: string | null;
          organization_id: string;
          website_id: string | null;
        };
        Insert: {
          created_at?: string;
          domain?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          organization_id: string;
          website_id?: string | null;
        };
        Update: {
          created_at?: string;
          domain?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          organization_id?: string;
          website_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "competitors_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competitors_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          error: string | null;
          id: string;
          idempotency_key: string | null;
          job_type: Database["public"]["Enums"]["job_type"];
          max_retries: number;
          organization_id: string;
          payload: Json;
          priority: number;
          result: Json | null;
          retry_count: number;
          started_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
          website_id: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          idempotency_key?: string | null;
          job_type: Database["public"]["Enums"]["job_type"];
          max_retries?: number;
          organization_id: string;
          payload?: Json;
          priority?: number;
          result?: Json | null;
          retry_count?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          website_id?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          idempotency_key?: string | null;
          job_type?: Database["public"]["Enums"]["job_type"];
          max_retries?: number;
          organization_id?: string;
          payload?: Json;
          priority?: number;
          result?: Json | null;
          retry_count?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          website_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      keywords: {
        Row: {
          country: string;
          created_at: string;
          id: string;
          intent: string | null;
          keyword: string;
          language: string;
          notes: string | null;
          organization_id: string;
          search_intent: Database["public"]["Enums"]["keyword_search_intent"];
          source: Database["public"]["Enums"]["keyword_source"];
          updated_at: string;
          website_id: string | null;
        };
        Insert: {
          country?: string;
          created_at?: string;
          id?: string;
          intent?: string | null;
          keyword: string;
          language?: string;
          notes?: string | null;
          organization_id: string;
          search_intent?: Database["public"]["Enums"]["keyword_search_intent"];
          source?: Database["public"]["Enums"]["keyword_source"];
          updated_at?: string;
          website_id?: string | null;
        };
        Update: {
          country?: string;
          created_at?: string;
          id?: string;
          intent?: string | null;
          keyword?: string;
          language?: string;
          notes?: string | null;
          organization_id?: string;
          search_intent?: Database["public"]["Enums"]["keyword_search_intent"];
          source?: Database["public"]["Enums"]["keyword_source"];
          updated_at?: string;
          website_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "keywords_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "keywords_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      keyword_metrics: {
        Row: {
          competition: number | null;
          cpc: number | null;
          id: string;
          keyword_id: string;
          measured_at: string;
          metric_source: string;
          search_volume: number | null;
        };
        Insert: {
          competition?: number | null;
          cpc?: number | null;
          id?: string;
          keyword_id: string;
          measured_at?: string;
          metric_source: string;
          search_volume?: number | null;
        };
        Update: {
          competition?: number | null;
          cpc?: number | null;
          id?: string;
          keyword_id?: string;
          measured_at?: string;
          metric_source?: string;
          search_volume?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "keyword_metrics_keyword_id_fkey";
            columns: ["keyword_id"];
            isOneToOne: false;
            referencedRelation: "keywords";
            referencedColumns: ["id"];
          },
        ];
      };
      keyword_page_matches: {
        Row: {
          created_at: string;
          id: string;
          keyword_id: string;
          match_type: Database["public"]["Enums"]["keyword_match_type"];
          page_id: string;
          relevance_score: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          keyword_id: string;
          match_type: Database["public"]["Enums"]["keyword_match_type"];
          page_id: string;
          relevance_score: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          keyword_id?: string;
          match_type?: Database["public"]["Enums"]["keyword_match_type"];
          page_id?: string;
          relevance_score?: number;
        };
        Relationships: [
          {
            foreignKeyName: "keyword_page_matches_keyword_id_fkey";
            columns: ["keyword_id"];
            isOneToOne: false;
            referencedRelation: "keywords";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "keyword_page_matches_page_id_fkey";
            columns: ["page_id"];
            isOneToOne: false;
            referencedRelation: "website_pages";
            referencedColumns: ["id"];
          },
        ];
      };
      keyword_opportunities: {
        Row: {
          business_relevance_score: number | null;
          commercial_value_score: number | null;
          created_at: string;
          current_page_id: string | null;
          difficulty_score: number | null;
          id: string;
          keyword_id: string;
          opportunity_score: number;
          opportunity_type: Database["public"]["Enums"]["opportunity_type"];
          organization_id: string;
          reasoning: string;
          recommended_action: string;
          seo_opportunity_id: string | null;
          status: Database["public"]["Enums"]["opportunity_status"];
          updated_at: string;
          website_id: string;
        };
        Insert: {
          business_relevance_score?: number | null;
          commercial_value_score?: number | null;
          created_at?: string;
          current_page_id?: string | null;
          difficulty_score?: number | null;
          id?: string;
          keyword_id: string;
          opportunity_score: number;
          opportunity_type: Database["public"]["Enums"]["opportunity_type"];
          organization_id: string;
          reasoning: string;
          recommended_action: string;
          seo_opportunity_id?: string | null;
          status?: Database["public"]["Enums"]["opportunity_status"];
          updated_at?: string;
          website_id: string;
        };
        Update: {
          business_relevance_score?: number | null;
          commercial_value_score?: number | null;
          created_at?: string;
          current_page_id?: string | null;
          difficulty_score?: number | null;
          id?: string;
          keyword_id?: string;
          opportunity_score?: number;
          opportunity_type?: Database["public"]["Enums"]["opportunity_type"];
          organization_id?: string;
          reasoning?: string;
          recommended_action?: string;
          seo_opportunity_id?: string | null;
          status?: Database["public"]["Enums"]["opportunity_status"];
          updated_at?: string;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "keyword_opportunities_current_page_id_fkey";
            columns: ["current_page_id"];
            isOneToOne: false;
            referencedRelation: "website_pages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "keyword_opportunities_keyword_id_fkey";
            columns: ["keyword_id"];
            isOneToOne: false;
            referencedRelation: "keywords";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "keyword_opportunities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "keyword_opportunities_seo_opportunity_id_fkey";
            columns: ["seo_opportunity_id"];
            isOneToOne: false;
            referencedRelation: "seo_opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "keyword_opportunities_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["membership_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          role?: Database["public"]["Enums"]["membership_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["membership_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      opportunity_keywords: {
        Row: { keyword_id: string; opportunity_id: string };
        Insert: { keyword_id: string; opportunity_id: string };
        Update: { keyword_id?: string; opportunity_id?: string };
        Relationships: [
          {
            foreignKeyName: "opportunity_keywords_keyword_id_fkey";
            columns: ["keyword_id"];
            isOneToOne: false;
            referencedRelation: "keywords";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "opportunity_keywords_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "seo_opportunities";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: { created_at: string; id: string; name: string; slug: string; updated_at: string };
        Insert: { created_at?: string; id?: string; name: string; slug: string; updated_at?: string };
        Update: { created_at?: string; id?: string; name?: string; slug?: string; updated_at?: string };
        Relationships: [];
      };
      page_links: {
        Row: {
          anchor_text: string | null;
          created_at: string;
          http_status: number | null;
          id: string;
          is_external: boolean;
          is_internal: boolean;
          source_page_id: string;
          target_page_id: string | null;
          target_url: string;
          website_id: string;
        };
        Insert: {
          anchor_text?: string | null;
          created_at?: string;
          http_status?: number | null;
          id?: string;
          is_external?: boolean;
          is_internal?: boolean;
          source_page_id: string;
          target_page_id?: string | null;
          target_url: string;
          website_id: string;
        };
        Update: {
          anchor_text?: string | null;
          created_at?: string;
          http_status?: number | null;
          id?: string;
          is_external?: boolean;
          is_internal?: boolean;
          source_page_id?: string;
          target_page_id?: string | null;
          target_url?: string;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "page_links_source_page_id_fkey";
            columns: ["source_page_id"];
            isOneToOne: false;
            referencedRelation: "website_pages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "page_links_target_page_id_fkey";
            columns: ["target_page_id"];
            isOneToOne: false;
            referencedRelation: "website_pages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "page_links_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      search_console_connections: {
        Row: {
          access_token: string | null;
          access_token_expires_at: string | null;
          connected_at: string;
          id: string;
          last_sync_error: string | null;
          organization_id: string;
          refresh_token: string;
          scope: string;
          site_url: string | null;
          status: Database["public"]["Enums"]["search_console_connection_status"];
          updated_at: string;
          website_id: string;
        };
        Insert: {
          access_token?: string | null;
          access_token_expires_at?: string | null;
          connected_at?: string;
          id?: string;
          last_sync_error?: string | null;
          organization_id: string;
          refresh_token: string;
          scope: string;
          site_url?: string | null;
          status?: Database["public"]["Enums"]["search_console_connection_status"];
          updated_at?: string;
          website_id: string;
        };
        Update: {
          access_token?: string | null;
          access_token_expires_at?: string | null;
          connected_at?: string;
          id?: string;
          last_sync_error?: string | null;
          organization_id?: string;
          refresh_token?: string;
          scope?: string;
          site_url?: string | null;
          status?: Database["public"]["Enums"]["search_console_connection_status"];
          updated_at?: string;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "search_console_connections_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_console_connections_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: true;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      search_console_metrics: {
        Row: {
          clicks: number;
          ctr: number;
          date: string;
          fetched_at: string;
          id: string;
          impressions: number;
          organization_id: string;
          page_url: string | null;
          position: number | null;
          query: string | null;
          website_id: string;
        };
        Insert: {
          clicks?: number;
          ctr?: number;
          date: string;
          fetched_at?: string;
          id?: string;
          impressions?: number;
          organization_id: string;
          page_url?: string | null;
          position?: number | null;
          query?: string | null;
          website_id: string;
        };
        Update: {
          clicks?: number;
          ctr?: number;
          date?: string;
          fetched_at?: string;
          id?: string;
          impressions?: number;
          organization_id?: string;
          page_url?: string | null;
          position?: number | null;
          query?: string | null;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "search_console_metrics_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_console_metrics_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      search_performance_opportunities: {
        Row: {
          ai_analysed_at: string | null;
          ai_rationale: string | null;
          ai_risk_notes: string | null;
          created_at: string;
          dedupe_key: string;
          detector_type: Database["public"]["Enums"]["search_performance_detector_type"];
          id: string;
          keyword_id: string | null;
          opportunity_score: number;
          organization_id: string;
          page_id: string | null;
          reasoning: string;
          recommended_action: Database["public"]["Enums"]["opportunity_type"];
          related_page_id: string | null;
          seo_opportunity_id: string | null;
          signals: Json;
          status: Database["public"]["Enums"]["opportunity_status"];
          updated_at: string;
          website_id: string;
        };
        Insert: {
          ai_analysed_at?: string | null;
          ai_rationale?: string | null;
          ai_risk_notes?: string | null;
          created_at?: string;
          dedupe_key: string;
          detector_type: Database["public"]["Enums"]["search_performance_detector_type"];
          id?: string;
          keyword_id?: string | null;
          opportunity_score: number;
          organization_id: string;
          page_id?: string | null;
          reasoning: string;
          recommended_action: Database["public"]["Enums"]["opportunity_type"];
          related_page_id?: string | null;
          seo_opportunity_id?: string | null;
          signals?: Json;
          status?: Database["public"]["Enums"]["opportunity_status"];
          updated_at?: string;
          website_id: string;
        };
        Update: {
          ai_analysed_at?: string | null;
          ai_rationale?: string | null;
          ai_risk_notes?: string | null;
          created_at?: string;
          dedupe_key?: string;
          detector_type?: Database["public"]["Enums"]["search_performance_detector_type"];
          id?: string;
          keyword_id?: string | null;
          opportunity_score?: number;
          organization_id?: string;
          page_id?: string | null;
          reasoning?: string;
          recommended_action?: Database["public"]["Enums"]["opportunity_type"];
          related_page_id?: string | null;
          seo_opportunity_id?: string | null;
          signals?: Json;
          status?: Database["public"]["Enums"]["opportunity_status"];
          updated_at?: string;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "search_performance_opportunities_keyword_id_fkey";
            columns: ["keyword_id"];
            isOneToOne: false;
            referencedRelation: "keywords";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_performance_opportunities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_performance_opportunities_page_id_fkey";
            columns: ["page_id"];
            isOneToOne: false;
            referencedRelation: "website_pages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_performance_opportunities_related_page_id_fkey";
            columns: ["related_page_id"];
            isOneToOne: false;
            referencedRelation: "website_pages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_performance_opportunities_seo_opportunity_id_fkey";
            columns: ["seo_opportunity_id"];
            isOneToOne: false;
            referencedRelation: "seo_opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_performance_opportunities_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      scheduler_runs: {
        Row: {
          completed_at: string | null;
          crawl_jobs_created: number;
          error: string | null;
          id: string;
          jobs_completed: number;
          jobs_failed: number;
          jobs_processed: number;
          jobs_retried: number;
          stale_recovered: number;
          started_at: string;
          status: Database["public"]["Enums"]["job_status"];
          summary: Json;
          websites_checked: number;
        };
        Insert: {
          completed_at?: string | null;
          crawl_jobs_created?: number;
          error?: string | null;
          id?: string;
          jobs_completed?: number;
          jobs_failed?: number;
          jobs_processed?: number;
          jobs_retried?: number;
          stale_recovered?: number;
          started_at?: string;
          status?: Database["public"]["Enums"]["job_status"];
          summary?: Json;
          websites_checked?: number;
        };
        Update: {
          completed_at?: string | null;
          crawl_jobs_created?: number;
          error?: string | null;
          id?: string;
          jobs_completed?: number;
          jobs_failed?: number;
          jobs_processed?: number;
          jobs_retried?: number;
          stale_recovered?: number;
          started_at?: string;
          status?: Database["public"]["Enums"]["job_status"];
          summary?: Json;
          websites_checked?: number;
        };
        Relationships: [];
      };
      seo_audits: {
        Row: {
          completed_at: string | null;
          created_at: string;
          id: string;
          issues_found: number;
          job_id: string | null;
          pages_analyzed: number;
          started_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
          summary: Json;
          website_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          issues_found?: number;
          job_id?: string | null;
          pages_analyzed?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          summary?: Json;
          website_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          issues_found?: number;
          job_id?: string | null;
          pages_analyzed?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          summary?: Json;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seo_audits_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_audits_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      seo_issues: {
        Row: {
          audit_id: string;
          category: string;
          created_at: string;
          description: string;
          detected_data: Json;
          id: string;
          issue_type: string;
          page_id: string | null;
          recommended_action: string;
          severity: Database["public"]["Enums"]["issue_severity"];
          status: Database["public"]["Enums"]["issue_status"];
          title: string;
          website_id: string;
        };
        Insert: {
          audit_id: string;
          category: string;
          created_at?: string;
          description: string;
          detected_data?: Json;
          id?: string;
          issue_type: string;
          page_id?: string | null;
          recommended_action: string;
          severity: Database["public"]["Enums"]["issue_severity"];
          status?: Database["public"]["Enums"]["issue_status"];
          title: string;
          website_id: string;
        };
        Update: {
          audit_id?: string;
          category?: string;
          created_at?: string;
          description?: string;
          detected_data?: Json;
          id?: string;
          issue_type?: string;
          page_id?: string | null;
          recommended_action?: string;
          severity?: Database["public"]["Enums"]["issue_severity"];
          status?: Database["public"]["Enums"]["issue_status"];
          title?: string;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seo_issues_audit_id_fkey";
            columns: ["audit_id"];
            isOneToOne: false;
            referencedRelation: "seo_audits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_issues_page_id_fkey";
            columns: ["page_id"];
            isOneToOne: false;
            referencedRelation: "website_pages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_issues_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      seo_opportunities: {
        Row: {
          ai_job_id: string | null;
          created_at: string;
          description: string;
          effort_estimate: Database["public"]["Enums"]["opportunity_effort"];
          id: string;
          organization_id: string;
          priority_components: Json;
          priority_score: number;
          rationale: string;
          status: Database["public"]["Enums"]["opportunity_status"];
          target_page_id: string | null;
          title: string;
          type: Database["public"]["Enums"]["opportunity_type"];
          updated_at: string;
          website_id: string;
        };
        Insert: {
          ai_job_id?: string | null;
          created_at?: string;
          description: string;
          effort_estimate?: Database["public"]["Enums"]["opportunity_effort"];
          id?: string;
          organization_id: string;
          priority_components?: Json;
          priority_score?: number;
          rationale: string;
          status?: Database["public"]["Enums"]["opportunity_status"];
          target_page_id?: string | null;
          title: string;
          type: Database["public"]["Enums"]["opportunity_type"];
          updated_at?: string;
          website_id: string;
        };
        Update: {
          ai_job_id?: string | null;
          created_at?: string;
          description?: string;
          effort_estimate?: Database["public"]["Enums"]["opportunity_effort"];
          id?: string;
          organization_id?: string;
          priority_components?: Json;
          priority_score?: number;
          rationale?: string;
          status?: Database["public"]["Enums"]["opportunity_status"];
          target_page_id?: string | null;
          title?: string;
          type?: Database["public"]["Enums"]["opportunity_type"];
          updated_at?: string;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seo_opportunities_ai_job_id_fkey";
            columns: ["ai_job_id"];
            isOneToOne: false;
            referencedRelation: "ai_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_opportunities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_opportunities_target_page_id_fkey";
            columns: ["target_page_id"];
            isOneToOne: false;
            referencedRelation: "website_pages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_opportunities_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      seo_tasks: {
        Row: {
          created_at: string;
          description: string | null;
          due_date: string | null;
          id: string;
          opportunity_id: string | null;
          organization_id: string;
          priority: number;
          status: Database["public"]["Enums"]["task_status"];
          title: string;
          type: Database["public"]["Enums"]["opportunity_type"];
          updated_at: string;
          website_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          opportunity_id?: string | null;
          organization_id: string;
          priority?: number;
          status?: Database["public"]["Enums"]["task_status"];
          title: string;
          type: Database["public"]["Enums"]["opportunity_type"];
          updated_at?: string;
          website_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          opportunity_id?: string | null;
          organization_id?: string;
          priority?: number;
          status?: Database["public"]["Enums"]["task_status"];
          title?: string;
          type?: Database["public"]["Enums"]["opportunity_type"];
          updated_at?: string;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seo_tasks_opportunity_id_fkey";
            columns: ["opportunity_id"];
            isOneToOne: false;
            referencedRelation: "seo_opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_tasks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seo_tasks_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      website_pages: {
        Row: {
          canonical_url: string | null;
          crawled_at: string | null;
          created_at: string;
          depth: number | null;
          external_links_count: number;
          first_seen_at: string;
          h1: string | null;
          has_structured_data: boolean;
          headings: Json;
          http_status: number | null;
          id: string;
          images_count: number;
          images_missing_alt_count: number;
          internal_links_count: number;
          is_noindex: boolean;
          is_orphan: boolean | null;
          last_seen_at: string;
          meta_description: string | null;
          path: string | null;
          raw_meta: Json;
          redirect_chain: Json | null;
          structured_data_types: string[];
          title: string | null;
          updated_at: string;
          url: string;
          url_hash: string;
          website_id: string;
          word_count: number | null;
        };
        Insert: {
          canonical_url?: string | null;
          crawled_at?: string | null;
          created_at?: string;
          depth?: number | null;
          external_links_count?: number;
          first_seen_at?: string;
          h1?: string | null;
          has_structured_data?: boolean;
          headings?: Json;
          http_status?: number | null;
          id?: string;
          images_count?: number;
          images_missing_alt_count?: number;
          internal_links_count?: number;
          is_noindex?: boolean;
          is_orphan?: boolean | null;
          last_seen_at?: string;
          meta_description?: string | null;
          path?: string | null;
          raw_meta?: Json;
          redirect_chain?: Json | null;
          structured_data_types?: string[];
          title?: string | null;
          updated_at?: string;
          url: string;
          url_hash: string;
          website_id: string;
          word_count?: number | null;
        };
        Update: {
          canonical_url?: string | null;
          crawled_at?: string | null;
          created_at?: string;
          depth?: number | null;
          external_links_count?: number;
          first_seen_at?: string;
          h1?: string | null;
          has_structured_data?: boolean;
          headings?: Json;
          http_status?: number | null;
          id?: string;
          images_count?: number;
          images_missing_alt_count?: number;
          internal_links_count?: number;
          is_noindex?: boolean;
          is_orphan?: boolean | null;
          last_seen_at?: string;
          meta_description?: string | null;
          path?: string | null;
          raw_meta?: Json;
          redirect_chain?: Json | null;
          structured_data_types?: string[];
          title?: string | null;
          updated_at?: string;
          url?: string;
          url_hash?: string;
          website_id?: string;
          word_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "website_pages_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      websites: {
        Row: {
          base_url: string;
          crawl_frequency_days: number;
          crawl_max_depth: number;
          crawl_max_pages: number;
          created_at: string;
          id: string;
          keyword_discovery_frequency_days: number;
          last_crawled_at: string | null;
          name: string;
          next_crawl_at: string | null;
          next_keyword_discovery_at: string | null;
          next_search_console_sync_at: string | null;
          organization_id: string;
          robots_txt_available: boolean | null;
          search_console_sync_frequency_days: number;
          sitemap_available: boolean | null;
          sitemap_url: string | null;
          status: Database["public"]["Enums"]["website_status"];
          updated_at: string;
        };
        Insert: {
          base_url: string;
          crawl_frequency_days?: number;
          crawl_max_depth?: number;
          crawl_max_pages?: number;
          created_at?: string;
          id?: string;
          keyword_discovery_frequency_days?: number;
          last_crawled_at?: string | null;
          name: string;
          next_crawl_at?: string | null;
          next_keyword_discovery_at?: string | null;
          next_search_console_sync_at?: string | null;
          organization_id: string;
          robots_txt_available?: boolean | null;
          search_console_sync_frequency_days?: number;
          sitemap_available?: boolean | null;
          sitemap_url?: string | null;
          status?: Database["public"]["Enums"]["website_status"];
          updated_at?: string;
        };
        Update: {
          base_url?: string;
          crawl_frequency_days?: number;
          crawl_max_depth?: number;
          crawl_max_pages?: number;
          created_at?: string;
          id?: string;
          keyword_discovery_frequency_days?: number;
          last_crawled_at?: string | null;
          name?: string;
          next_crawl_at?: string | null;
          next_keyword_discovery_at?: string | null;
          next_search_console_sync_at?: string | null;
          organization_id?: string;
          robots_txt_available?: boolean | null;
          search_console_sync_frequency_days?: number;
          sitemap_available?: boolean | null;
          sitemap_url?: string | null;
          status?: Database["public"]["Enums"]["website_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "websites_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_org_member: { Args: { target_org_id: string }; Returns: boolean };
    };
    Enums: {
      issue_severity: "critical" | "high" | "medium" | "low";
      issue_status: "open" | "resolved" | "ignored";
      job_status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
      job_type:
        | "CRAWL_WEBSITE"
        | "ANALYSE_WEBSITE"
        | "RUN_SEO_AUDIT"
        | "GENERATE_SEO_OPPORTUNITIES"
        | "KEYWORD_DISCOVERY"
        | "SEARCH_CONSOLE_SYNC"
        | "ANALYSE_SEARCH_PERFORMANCE";
      keyword_match_type: "title" | "h1" | "heading" | "url" | "meta_description" | "ai_semantic" | "none";
      keyword_search_intent: "INFORMATIONAL" | "COMMERCIAL" | "TRANSACTIONAL" | "NAVIGATIONAL" | "LOCAL" | "UNKNOWN";
      keyword_source: "ai_suggested" | "manual" | "provider";
      membership_role: "owner" | "admin" | "member";
      opportunity_effort: "low" | "medium" | "high";
      opportunity_status: "new" | "approved" | "rejected" | "done";
      opportunity_type:
        | "CREATE_NEW_PAGE"
        | "OPTIMISE_EXISTING_PAGE"
        | "TECHNICAL_FIX"
        | "INTERNAL_LINKING"
        | "RESEARCH_REQUIRED"
        | "IMPROVE_CTR"
        | "INVESTIGATE_DECLINE"
        | "INVESTIGATE_OPPORTUNITY"
        | "IMPROVE_INTERNAL_LINKING";
      search_console_connection_status: "pending_site_selection" | "active" | "error";
      search_performance_detector_type:
        | "PAGE_TWO_OPPORTUNITY"
        | "HIGH_IMPRESSIONS_LOW_CTR"
        | "MISSING_PAGE"
        | "DECLINING_KEYWORD"
        | "EMERGING_KEYWORD"
        | "CONTENT_GAP"
        | "INTERNAL_LINK_OPPORTUNITY";
      task_status: "pending" | "in_progress" | "completed" | "cancelled";
      website_status: "active" | "paused" | "archived";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

// --- Convenience aliases used throughout lib/ and app/ (not part of the generated contract) ---

export type MembershipRole = Database["public"]["Enums"]["membership_role"];
export type WebsiteStatus = Database["public"]["Enums"]["website_status"];
export type JobType = Database["public"]["Enums"]["job_type"];
export type JobStatus = Database["public"]["Enums"]["job_status"];
export type IssueSeverity = Database["public"]["Enums"]["issue_severity"];
export type IssueStatus = Database["public"]["Enums"]["issue_status"];
export type OpportunityType = Database["public"]["Enums"]["opportunity_type"];
export type OpportunityEffort = Database["public"]["Enums"]["opportunity_effort"];
export type OpportunityStatus = Database["public"]["Enums"]["opportunity_status"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type KeywordSource = Database["public"]["Enums"]["keyword_source"];
export type KeywordSearchIntent = Database["public"]["Enums"]["keyword_search_intent"];
export type KeywordMatchType = Database["public"]["Enums"]["keyword_match_type"];
export type SearchConsoleConnectionStatus = Database["public"]["Enums"]["search_console_connection_status"];
export type SearchPerformanceDetectorType = Database["public"]["Enums"]["search_performance_detector_type"];

/** Shape of website_pages.headings (stored as jsonb; not enforced by Postgres). */
export interface Heading {
  level: number;
  text: string;
}

/** Shape of website_pages.redirect_chain (stored as jsonb; not enforced by Postgres). */
export interface RedirectHop {
  url: string;
  status: number;
}

/**
 * Postgres doesn't structurally validate jsonb column contents, so the
 * generated `Json` type is deliberately loose. This cast is the single
 * sanctioned boundary between "the concrete TS shape we actually write"
 * (Heading[], Record<string, unknown>, etc.) and the wire-format `Json` type
 * — used inside lib/db/* right before handing a value to supabase-js, never
 * scattered through call sites.
 */
export function jsonb(value: unknown): Json {
  return value as Json;
}

/** website_pages row with the jsonb columns narrowed to their known shape (see `jsonb()` above). */
export type WebsitePage = Omit<Database["public"]["Tables"]["website_pages"]["Row"], "headings" | "redirect_chain"> & {
  headings: Heading[];
  redirect_chain: RedirectHop[] | null;
};
