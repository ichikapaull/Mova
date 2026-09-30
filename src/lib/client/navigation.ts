"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Number of client-side page views since the app was loaded (resets on reload). */
let pageViews = 0;

export function useTrackNavigation(): void {
  const pathname = usePathname();
  useEffect(() => {
    pageViews++;
  }, [pathname]);
}

/** True when `router.back()` stays inside Mova. */
export function canGoBackInApp(): boolean {
  return pageViews > 1;
}
