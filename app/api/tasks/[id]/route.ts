import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { updateTaskStatus } from "@/lib/db/tasks";
import { jsonZodError, withErrorHandling } from "@/lib/api/respond";

const patchSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonZodError(parsed.error);

  const task = await updateTaskStatus(id, parsed.data.status);
  return NextResponse.json({ task });
});
