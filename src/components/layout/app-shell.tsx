"use client";

import { Suspense, useState } from "react";
import { GlobalSearch } from "@/components/layout/global-search";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { SIDEBAR_COOKIE } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function AppShell({ initialCollapsed, children }: { initialCollapsed: boolean; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = () => {
    setCollapsed((value) => {
      const next = !value;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  };

  return (
    <div className={cn("min-h-dvh pb-16 transition-[padding] duration-200 ease-out md:pb-0", collapsed ? "md:pl-(--sidebar-width-collapsed)" : "md:pl-(--sidebar-width)")}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-transparent bg-background/80 px-6 backdrop-blur-xl lg:px-10">
        <Suspense fallback={<div className="h-9 w-full max-w-md rounded-lg bg-white/[0.05]" />}>
          <GlobalSearch />
        </Suspense>
      </header>
      <main id="main">{children}</main>
      <MobileNav />
    </div>
  );
}
