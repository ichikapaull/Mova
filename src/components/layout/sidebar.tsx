"use client";

import {
  ClockIcon,
  DicesIcon,
  FolderHeartIcon,
  HashIcon,
  HeartIcon,
  HomeIcon,
  LibraryIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SettingsIcon,
  ShapesIcon,
  TvIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIndicator } from "@/components/layout/activity-indicator";
import { Logo } from "@/components/layout/logo";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", icon: HomeIcon, exact: true },
  { href: "/library", label: "Library", icon: LibraryIcon },
  { href: "/recent", label: "Recently Added", icon: ClockIcon },
  { href: "/favorites", label: "Favorites", icon: HeartIcon },
  { href: "/random", label: "Random", icon: DicesIcon },
  { divider: true },
  { href: "/categories", label: "Categories", icon: ShapesIcon },
  { href: "/tags", label: "Tags", icon: HashIcon },
  { href: "/collections", label: "Collections", icon: FolderHeartIcon },
  { href: "/series", label: "Series", icon: TvIcon },
] as const;

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  const link = (href: string, label: string, Icon: React.ComponentType<{ className?: string }>, active: boolean) => {
    const content = (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-9 items-center gap-3 rounded-md px-2.5 text-[13.5px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-white/[0.04] hover:text-foreground",
          active && "bg-white/[0.06] text-foreground",
          collapsed && "justify-center px-0",
        )}
      >
        {active && <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-brand" />}
        <Icon className="size-[18px] shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
    return collapsed ? (
      <Tooltip key={href} content={label} side="right">
        {content}
      </Tooltip>
    ) : (
      <div key={href}>{content}</div>
    );
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-[#0b0b0b] transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-(--sidebar-width-collapsed)" : "w-(--sidebar-width)",
      )}
    >
      <div className={cn("flex h-16 items-center px-4", collapsed && "justify-center px-0")}>
        <Link href="/" aria-label="Mova home">
          <Logo collapsed={collapsed} />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
        {NAV.map((item, index) =>
          "divider" in item ? (
            <div key={`d${index}`} className="mx-2.5 my-3 h-px bg-border" />
          ) : (
            link(item.href, item.label, item.icon, isActive(item.href, "exact" in item ? item.exact : false))
          ),
        )}
      </nav>
      <div className="flex flex-col gap-0.5 border-t border-border px-3 py-3">
        <ActivityIndicator collapsed={collapsed} />
        {link("/settings", "Settings", SettingsIcon, isActive("/settings"))}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] text-subtle-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <PanelLeftOpenIcon className="size-[18px]" /> : <PanelLeftCloseIcon className="size-[18px]" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

/** Bottom tab bar for narrow windows. */
export function MobileNav() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Home", icon: HomeIcon },
    { href: "/library", label: "Library", icon: LibraryIcon },
    { href: "/favorites", label: "Favorites", icon: HeartIcon },
    { href: "/series", label: "Series", icon: TvIcon },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-[#0b0b0b]/95 backdrop-blur-lg md:hidden" aria-label="Main">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn("flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] text-muted-foreground", active && "text-foreground")}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
