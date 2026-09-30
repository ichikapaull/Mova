import type * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-md border border-input bg-white/[0.03] px-3 py-2 text-sm outline-none transition-[border-color,background-color] duration-150 placeholder:text-subtle-foreground focus-visible:border-border-strong focus-visible:bg-white/[0.05] disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
