import { cn } from "@/lib/utils";

export function Logo({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" className="size-3.5 translate-x-px" aria-hidden>
          <path d="M7 4.8v14.4a1 1 0 0 0 1.53.85l11.3-7.2a1 1 0 0 0 0-1.7L8.53 3.95A1 1 0 0 0 7 4.8Z" fill="var(--brand)" />
        </svg>
      </span>
      {!collapsed && <span className="text-[17px] font-semibold tracking-tight">mova</span>}
    </span>
  );
}
