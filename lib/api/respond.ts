import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function jsonZodError(error: ZodError) {
  return NextResponse.json({ error: "Invalid request body", issues: error.issues }, { status: 400 });
}

/** Wraps a route handler so unexpected exceptions become a clean 500 instead of an opaque crash. */
export function withErrorHandling<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error("[api] unhandled error:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      return jsonError(message, 500);
    }
  };
}
