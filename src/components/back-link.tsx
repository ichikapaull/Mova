"use client";

import { ChevronLeftIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { canGoBackInApp } from "@/lib/client/navigation";
import { cn } from "@/lib/utils";

/** Goes back in history when we came from inside the app (keeps scroll/filter state), else to `fallback`. */
export function useGoBack(fallback: string) {
  const router = useRouter();
  return () => {
    if (canGoBackInApp()) router.back();
    else router.push(fallback);
  };
}

export function BackLink({ fallback, label = "Back", className }: { fallback: string; label?: string; className?: string }) {
  const goBack = useGoBack(fallback);
  return (
    <button
      type="button"
      onClick={goBack}
      className={cn("flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground", className)}
    >
      <ChevronLeftIcon className="size-4" /> {label}
    </button>
  );
}
