"use client";

import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/** Successful void actions resolve to `true`, so `undefined` always means failure. */
type Settled<T> = [T] extends [void] ? true : T;

/** Awaits a server action, surfacing failures as a toast. Resolves to the data, or undefined on failure. */
export async function callAction<T>(
  action: Promise<ActionResult<T>>,
  messages: { success?: string | ((data: T) => string); error?: string } = {},
): Promise<Settled<T> | undefined> {
  try {
    const result = await action;
    if (!result.ok) {
      toast.error(messages.error ?? "Action failed", { description: result.error });
      return undefined;
    }
    if (messages.success) toast.success(typeof messages.success === "function" ? messages.success(result.data) : messages.success);
    return (result.data === undefined ? true : result.data) as Settled<T>;
  } catch (error) {
    toast.error(messages.error ?? "Action failed", {
      description: error instanceof Error ? error.message : "The server could not be reached.",
    });
    return undefined;
  }
}
