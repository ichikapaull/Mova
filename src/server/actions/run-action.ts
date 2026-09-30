import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { DatabaseUnavailableError } from "@/server/db";

/**
 * Executes a server action body, turning thrown errors into a user-facing message
 * and revalidating cached pages after successful mutations.
 */
export async function runAction<T>(body: () => T | Promise<T>, options: { revalidate?: boolean } = {}): Promise<ActionResult<T>> {
  try {
    const data = await body();
    if (options.revalidate !== false) revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ZodError) return { ok: false, error: "Invalid input." };
    if (error instanceof DatabaseUnavailableError) return { ok: false, error: "The library database is unavailable." };
    const message = error instanceof Error ? error.message : "Something went wrong.";
    if (!(error instanceof Error) || error.name === "Error" || error.name === "TypeError") {
      console.error("[action]", error);
    }
    return { ok: false, error: message };
  }
}
