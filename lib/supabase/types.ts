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
      content_briefs: {
        Row: {
          brief_data: Json;
          content_type: Database["public"]["Enums"]["opportunity_type"];
          created_at: string;
          id: string;
          organization_id: string;
          primary_keyword: string | null;
          primary_keyword_id: string | null;
          search_intent: string | null;
          seo_opportunity_id: string;
          seo_task_id: string | null;
          status: Database["public"]["Enums"]["content_brief_status"];
          target_url: string | null;
          updated_at: string;
          website_id: string;
        };
        Insert: {
          brief_data?: Json;
          content_type: Database["public"]["Enums"]["opportunity_type"];
          created_at?: string;
          id?: string;
          organization_id: string;
          primary_keyword?: string | null;
          primary_keyword_id?: string | null;
          search_intent?: string | null;
          seo_opportunity_id: string;
          seo_task_id?: string | null;
          status?: Database["public"]["Enums"]["content_brief_status"];
          target_url?: string | null;
          updated_at?: string;
          website_id: string;
        };
        Update: {
          brief_data?: Json;
          content_type?: Database["public"]["Enums"]["opportunity_type"];
          created_at?: string;
          id?: string;
          organization_id?: string;
          primary_keyword?: string | null;
          primary_keyword_id?: string | null;
          search_intent?: string | null;
          seo_opportunity_id?: string;
          seo_task_id?: string | null;
          status?: Database["public"]["Enums"]["content_brief_status"];
          target_url?: string | null;
          updated_at?: string;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_briefs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_briefs_primary_keyword_id_fkey";
            columns: ["primary_keyword_id"];
            isOneToOne: false;
            referencedRelation: "keywords";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_briefs_seo_opportunity_id_fkey";
            columns: ["seo_opportunity_id"];
            isOneToOne: false;
            referencedRelation: "seo_opportunities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_briefs_seo_task_id_fkey";
            columns: ["seo_task_id"];
            isOneToOne: false;
            referencedRelation: "seo_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_briefs_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      content_jobs: {
        Row: {
          attempts: number;
          completed_at: string | null;
          content_brief_id: string;
          created_at: string;
          error: string | null;
          id: string;
          organization_id: string;
          provider: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["content_pipeline_status"];
          website_id: string;
        };
        Insert: {
          attempts?: number;
          completed_at?: string | null;
          content_brief_id: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          organization_id: string;
          provider: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["content_pipeline_status"];
          website_id: string;
        };
        Update: {
          attempts?: number;
          completed_at?: string | null;
          content_brief_id?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          organization_id?: string;
          provider?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["content_pipeline_status"];
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_jobs_content_brief_id_fkey";
            columns: ["content_brief_id"];
            isOneToOne: false;
            referencedRelation: "content_briefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_jobs_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      content_qa_results: {
        Row: {
          ai_feedback: Json | null;
          ai_job_id: string | null;
          content_version_id: string;
          created_at: string;
          deterministic_checks: Json;
          id: string;
          issues: Json;
          model: string | null;
          organization_id: string;
          passed: boolean;
          prompt_version: string | null;
          score: number;
          website_id: string;
        };
        Insert: {
          ai_feedback?: Json | null;
          ai_job_id?: string | null;
          content_version_id: string;
          created_at?: string;
          deterministic_checks?: Json;
          id?: string;
          issues?: Json;
          model?: string | null;
          organization_id: string;
          passed: boolean;
          prompt_version?: string | null;
          score: number;
          website_id: string;
        };
        Update: {
          ai_feedback?: Json | null;
          ai_job_id?: string | null;
          content_version_id?: string;
          created_at?: string;
          deterministic_checks?: Json;
          id?: string;
          issues?: Json;
          model?: string | null;
          organization_id?: string;
          passed?: boolean;
          prompt_version?: string | null;
          score?: number;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_qa_results_ai_job_id_fkey";
            columns: ["ai_job_id"];
            isOneToOne: false;
            referencedRelation: "ai_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_qa_results_content_version_id_fkey";
            columns: ["content_version_id"];
            isOneToOne: false;
            referencedRelation: "content_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_qa_results_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_qa_results_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      content_versions: {
        Row: {
          content: string;
          content_brief_id: string;
          content_job_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          organization_id: string;
          qa_status: Database["public"]["Enums"]["content_qa_status"];
          title: string | null;
          version_number: number;
          website_id: string;
        };
        Insert: {
          content: string;
          content_brief_id: string;
          content_job_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          organization_id: string;
          qa_status?: Database["public"]["Enums"]["content_qa_status"];
          title?: string | null;
          version_number: number;
          website_id: string;
        };
        Update: {
          content?: string;
          content_brief_id?: string;
          content_job_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          organization_id?: string;
          qa_status?: Database["public"]["Enums"]["content_qa_status"];
          title?: string | null;
          version_number?: number;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_versions_content_brief_id_fkey";
            columns: ["content_brief_id"];
            isOneToOne: false;
            referencedRelation: "content_briefs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_versions_content_job_id_fkey";
            columns: ["content_job_id"];
            isOneToOne: false;
            referencedRelation: "content_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_versions_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      cms_connections: {
        Row: {
          base_url: string;
          created_at: string;
          credential_secret_id: string;
          id: string;
          last_test_error: string | null;
          last_tested_at: string | null;
          organization_id: string;
          provider: Database["public"]["Enums"]["cms_provider"];
          status: Database["public"]["Enums"]["cms_connection_status"];
          updated_at: string;
          username: string;
          website_id: string;
        };
        Insert: {
          base_url: string;
          created_at?: string;
          credential_secret_id: string;
          id?: string;
          last_test_error?: string | null;
          last_tested_at?: string | null;
          organization_id: string;
          provider?: Database["public"]["Enums"]["cms_provider"];
          status?: Database["public"]["Enums"]["cms_connection_status"];
          updated_at?: string;
          username: string;
          website_id: string;
        };
        Update: {
          base_url?: string;
          created_at?: string;
          credential_secret_id?: string;
          id?: string;
          last_test_error?: string | null;
          last_tested_at?: string | null;
          organization_id?: string;
          provider?: Database["public"]["Enums"]["cms_provider"];
          status?: Database["public"]["Enums"]["cms_connection_status"];
          updated_at?: string;
          username?: string;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cms_connections_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cms_connections_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: true;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      content_publications: {
        Row: {
          content_version_id: string;
          created_at: string;
          error: string | null;
          external_id: string | null;
          id: string;
          organization_id: string;
          provider: Database["public"]["Enums"]["cms_provider"];
          provider_response_metadata: Json;
          published_at: string | null;
          publication_type: Database["public"]["Enums"]["opportunity_type"];
          status: Database["public"]["Enums"]["publication_status"];
          target_url: string | null;
          updated_at: string;
          website_id: string;
        };
        Insert: {
          content_version_id: string;
          created_at?: string;
          error?: string | null;
          external_id?: string | null;
          id?: string;
          organization_id: string;
          provider?: Database["public"]["Enums"]["cms_provider"];
          provider_response_metadata?: Json;
          published_at?: string | null;
          publication_type: Database["public"]["Enums"]["opportunity_type"];
          status?: Database["public"]["Enums"]["publication_status"];
          target_url?: string | null;
          updated_at?: string;
          website_id: string;
        };
        Update: {
          content_version_id?: string;
          created_at?: string;
          error?: string | null;
          external_id?: string | null;
          id?: string;
          organization_id?: string;
          provider?: Database["public"]["Enums"]["cms_provider"];
          provider_response_metadata?: Json;
          published_at?: string | null;
          publication_type?: Database["public"]["Enums"]["opportunity_type"];
          status?: Database["public"]["Enums"]["publication_status"];
          target_url?: string | null;
          updated_at?: string;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_publications_content_version_id_fkey";
            columns: ["content_version_id"];
            isOneToOne: false;
            referencedRelation: "content_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_publications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_publications_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      publication_audit_log: {
        Row: {
          action: string;
          actor: string;
          content_publication_id: string | null;
          content_version_id: string;
          created_at: string;
          failure_reason: string | null;
          id: string;
          organization_id: string;
          result: string | null;
          target_url: string | null;
          website_id: string;
        };
        Insert: {
          action: string;
          actor?: string;
          content_publication_id?: string | null;
          content_version_id: string;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          organization_id: string;
          result?: string | null;
          target_url?: string | null;
          website_id: string;
        };
        Update: {
          action?: string;
          actor?: string;
          content_publication_id?: string | null;
          content_version_id?: string;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          organization_id?: string;
          result?: string | null;
          target_url?: string | null;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "publication_audit_log_content_publication_id_fkey";
            columns: ["content_publication_id"];
            isOneToOne: false;
            referencedRelation: "content_publications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "publication_audit_log_content_version_id_fkey";
            columns: ["content_version_id"];
            isOneToOne: false;
            referencedRelation: "content_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "publication_audit_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "publication_audit_log_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
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
      competitor_domains: {
        Row: {
          appearances: number;
          average_position: number | null;
          classification: Database["public"]["Enums"]["competitor_classification"];
          domain: string;
          first_seen_at: string;
          id: string;
          last_seen_at: string;
          organization_id: string;
          relevance_score: number | null;
          relevant_keyword_count: number;
          updated_at: string;
          website_id: string;
        };
        Insert: {
          appearances?: number;
          average_position?: number | null;
          classification?: Database["public"]["Enums"]["competitor_classification"];
          domain: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          organization_id: string;
          relevance_score?: number | null;
          relevant_keyword_count?: number;
          updated_at?: string;
          website_id: string;
        };
        Update: {
          appearances?: number;
          average_position?: number | null;
          classification?: Database["public"]["Enums"]["competitor_classification"];
          domain?: string;
          first_seen_at?: string;
          id?: string;
          last_seen_at?: string;
          organization_id?: string;
          relevance_score?: number | null;
          relevant_keyword_count?: number;
          updated_at?: string;
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "competitor_domains_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competitor_domains_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      competitor_pages: {
        Row: {
          competitor_domain_id: string;
          crawl_status: Database["public"]["Enums"]["job_status"];
          created_at: string;
          first_seen_at: string;
          h1: string | null;
          has_structured_data: boolean;
          headings: Json;
          id: string;
          last_crawled_at: string | null;
          last_seen_at: string;
          major_topics: string[];
          meta_description: string | null;
          structured_data_types: string[];
          title: string | null;
          updated_at: string;
          url: string;
          word_count: number | null;
        };
        Insert: {
          competitor_domain_id: string;
          crawl_status?: Database["public"]["Enums"]["job_status"];
          created_at?: string;
          first_seen_at?: string;
          h1?: string | null;
          has_structured_data?: boolean;
          headings?: Json;
          id?: string;
          last_crawled_at?: string | null;
          last_seen_at?: string;
          major_topics?: string[];
          meta_description?: string | null;
          structured_data_types?: string[];
          title?: string | null;
          updated_at?: string;
          url: string;
          word_count?: number | null;
        };
        Update: {
          competitor_domain_id?: string;
          crawl_status?: Database["public"]["Enums"]["job_status"];
          created_at?: string;
          first_seen_at?: string;
          h1?: string | null;
          has_structured_data?: boolean;
          headings?: Json;
          id?: string;
          last_crawled_at?: string | null;
          last_seen_at?: string;
          major_topics?: string[];
          meta_description?: string | null;
          structured_data_types?: string[];
          title?: string | null;
          updated_at?: string;
          url?: string;
          word_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "competitor_pages_competitor_domain_id_fkey";
            columns: ["competitor_domain_id"];
            isOneToOne: false;
            referencedRelation: "competitor_domains";
            referencedColumns: ["id"];
          },
        ];
      };
      serp_runs: {
        Row: {
          country: string;
          created_at: string;
          error: string | null;
          features: Json;
          id: string;
          keyword: string;
          keyword_id: string | null;
          language: string;
          location: string | null;
          organization_id: string;
          raw_response: Json | null;
          search_engine: string;
          searched_at: string | null;
          status: Database["public"]["Enums"]["job_status"];
          website_id: string;
        };
        Insert: {
          country?: string;
          created_at?: string;
          error?: string | null;
          features?: Json;
          id?: string;
          keyword: string;
          keyword_id?: string | null;
          language?: string;
          location?: string | null;
          organization_id: string;
          raw_response?: Json | null;
          search_engine?: string;
          searched_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          website_id: string;
        };
        Update: {
          country?: string;
          created_at?: string;
          error?: string | null;
          features?: Json;
          id?: string;
          keyword?: string;
          keyword_id?: string | null;
          language?: string;
          location?: string | null;
          organization_id?: string;
          raw_response?: Json | null;
          search_engine?: string;
          searched_at?: string | null;
          status?: Database["public"]["Enums"]["job_status"];
          website_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "serp_runs_keyword_id_fkey";
            columns: ["keyword_id"];
            isOneToOne: false;
            referencedRelation: "keywords";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "serp_runs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "serp_runs_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };
      serp_results: {
        Row: {
          created_at: string;
          description: string | null;
          domain: string;
          id: string;
          is_client_domain: boolean;
          position: number;
          result_type: string;
          serp_run_id: string;
          title: string | null;
          url: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          domain: string;
          id?: string;
          is_client_domain?: boolean;
          position: number;
          result_type?: string;
          serp_run_id: string;
          title?: string | null;
          url: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          domain?: string;
          id?: string;
          is_client_domain?: boolean;
          position?: number;
          result_type?: string;
          serp_run_id?: string;
          title?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "serp_results_serp_run_id_fkey";
            columns: ["serp_run_id"];
            isOneToOne: false;
            referencedRelation: "serp_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_usage: {
        Row: {
          created_at: string;
          estimated_cost_usd: number | null;
          id: string;
          operation: string;
          organization_id: string;
          provider: string;
          units: number;
          website_id: string | null;
        };
        Insert: {
          created_at?: string;
          estimated_cost_usd?: number | null;
          id?: string;
          operation: string;
          organization_id: string;
          provider: string;
          units?: number;
          website_id?: string | null;
        };
        Update: {
          created_at?: string;
          estimated_cost_usd?: number | null;
          id?: string;
          operation?: string;
          organization_id?: string;
          provider?: string;
          units?: number;
          website_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "provider_usage_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_usage_website_id_fkey";
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
          brand_voice: string | null;
          business_description: string | null;
          content_constraints: string | null;
          crawl_frequency_days: number;
          crawl_max_depth: number;
          crawl_max_pages: number;
          created_at: string;
          id: string;
          default_serp_location: string | null;
          target_audience: string | null;
          keyword_discovery_frequency_days: number;
          last_crawled_at: string | null;
          name: string;
          next_crawl_at: string | null;
          next_keyword_discovery_at: string | null;
          next_search_console_sync_at: string | null;
          next_serp_fetch_at: string | null;
          organization_id: string;
          robots_txt_available: boolean | null;
          search_console_sync_frequency_days: number;
          serp_fetch_frequency_days: number;
          sitemap_available: boolean | null;
          sitemap_url: string | null;
          status: Database["public"]["Enums"]["website_status"];
          updated_at: string;
        };
        Insert: {
          base_url: string;
          brand_voice?: string | null;
          business_description?: string | null;
          content_constraints?: string | null;
          crawl_frequency_days?: number;
          crawl_max_depth?: number;
          crawl_max_pages?: number;
          created_at?: string;
          default_serp_location?: string | null;
          id?: string;
          keyword_discovery_frequency_days?: number;
          last_crawled_at?: string | null;
          name: string;
          next_crawl_at?: string | null;
          next_keyword_discovery_at?: string | null;
          next_search_console_sync_at?: string | null;
          next_serp_fetch_at?: string | null;
          organization_id: string;
          robots_txt_available?: boolean | null;
          search_console_sync_frequency_days?: number;
          serp_fetch_frequency_days?: number;
          sitemap_available?: boolean | null;
          sitemap_url?: string | null;
          status?: Database["public"]["Enums"]["website_status"];
          target_audience?: string | null;
          updated_at?: string;
        };
        Update: {
          base_url?: string;
          brand_voice?: string | null;
          business_description?: string | null;
          content_constraints?: string | null;
          crawl_frequency_days?: number;
          crawl_max_depth?: number;
          crawl_max_pages?: number;
          created_at?: string;
          default_serp_location?: string | null;
          id?: string;
          keyword_discovery_frequency_days?: number;
          last_crawled_at?: string | null;
          name?: string;
          next_crawl_at?: string | null;
          next_keyword_discovery_at?: string | null;
          next_search_console_sync_at?: string | null;
          next_serp_fetch_at?: string | null;
          organization_id?: string;
          robots_txt_available?: boolean | null;
          search_console_sync_frequency_days?: number;
          serp_fetch_frequency_days?: number;
          sitemap_available?: boolean | null;
          sitemap_url?: string | null;
          status?: Database["public"]["Enums"]["website_status"];
          target_audience?: string | null;
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
      cms_credential_create: { Args: { p_secret: string; p_description?: string }; Returns: string };
      cms_credential_read: { Args: { p_id: string }; Returns: string };
      cms_credential_update: { Args: { p_id: string; p_secret: string }; Returns: undefined };
      cms_credential_delete: { Args: { p_id: string }; Returns: undefined };
    };
    Enums: {
      cms_connection_status: "pending" | "active" | "error";
      cms_provider: "wordpress";
      competitor_classification: "DIRECT_COMPETITOR" | "DIRECTORY" | "MARKETPLACE" | "INFORMATIONAL" | "OTHER" | "UNKNOWN";
      content_brief_status: "DRAFT" | "SUBMITTED";
      content_pipeline_status: "DRAFT" | "QA_PENDING" | "QA_FAILED" | "NEEDS_REVIEW" | "READY_FOR_APPROVAL" | "APPROVED" | "REJECTED";
      content_qa_status: "PENDING" | "PASSED" | "FAILED";
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
        | "ANALYSE_SEARCH_PERFORMANCE"
        | "FETCH_SERP_RESULTS"
        | "ANALYSE_COMPETITORS"
        | "ANALYSE_COMPETITOR_GAPS"
        | "GENERATE_CONTENT"
        | "QA_CONTENT"
        | "REVISE_CONTENT"
        | "CREATE_DRAFT"
        | "PUBLISH_CONTENT";
      keyword_match_type: "title" | "h1" | "heading" | "url" | "meta_description" | "ai_semantic" | "none";
      keyword_search_intent: "INFORMATIONAL" | "COMMERCIAL" | "TRANSACTIONAL" | "NAVIGATIONAL" | "LOCAL" | "UNKNOWN";
      keyword_source: "ai_suggested" | "manual" | "provider";
      membership_role: "owner" | "admin" | "member";
      opportunity_effort: "low" | "medium" | "high";
      opportunity_status: "new" | "approved" | "rejected" | "done";
      publication_status: "PENDING" | "PUBLISHING" | "DRAFTED" | "PUBLISHED" | "FAILED" | "UNPUBLISHED";
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
        | "INTERNAL_LINK_OPPORTUNITY"
        | "COMPETITOR_CONTENT_GAP"
        | "COMPETITOR_RANKING_GAP"
        | "SERP_FEATURE_OPPORTUNITY";
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
export type CompetitorClassification = Database["public"]["Enums"]["competitor_classification"];
export type ContentBriefStatus = Database["public"]["Enums"]["content_brief_status"];
export type ContentPipelineStatus = Database["public"]["Enums"]["content_pipeline_status"];
export type ContentQaStatus = Database["public"]["Enums"]["content_qa_status"];
export type CmsProvider = Database["public"]["Enums"]["cms_provider"];
export type CmsConnectionStatus = Database["public"]["Enums"]["cms_connection_status"];
export type PublicationStatus = Database["public"]["Enums"]["publication_status"];

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
