import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-white/10 text-foreground",
        outline: "border border-border-strong text-muted-foreground",
        brand: "bg-brand-soft text-brand",
        destructive: "bg-destructive/15 text-destructive",
        warning: "bg-warning/15 text-warning",
        overlay: "bg-black/70 text-white backdrop-blur-sm",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
