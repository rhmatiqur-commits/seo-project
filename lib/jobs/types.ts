import type { Database } from "@/lib/supabase/types";

export type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export interface JobHandlerContext {
  job: JobRow;
}

export type JobHandler = (ctx: JobHandlerContext) => Promise<Record<string, unknown>>;
