import { cn } from "@/lib/utils";

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset; next/image is unused (no sharp) */}
      <img src="/mova-mark.png" alt="" width={32} height={32} className="size-8 shrink-0" />
      {!collapsed && <span className="text-[17px] font-semibold tracking-tight">mova</span>}
    </span>
  );
}
