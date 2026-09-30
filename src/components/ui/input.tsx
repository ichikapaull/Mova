import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-input bg-white/[0.03] px-3 py-1 text-sm transition-[border-color,background-color] duration-150 outline-none placeholder:text-subtle-foreground focus-visible:border-border-strong focus-visible:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
