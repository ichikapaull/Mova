"use client";

import { useState } from "react";
import { CATEGORY_ICONS } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type CategoryFormValue = { name: string; icon: string | null; description: string | null };

/** Create/edit form for a category (name, optional icon, optional description). */
export function CategoryFormDialog({
  title,
  initial,
  submitLabel,
  onSubmit,
}: {
  title: string;
  initial?: Partial<CategoryFormValue>;
  submitLabel: string;
  onSubmit: (value: CategoryFormValue) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Categories group videos broadly (Anime, Movies, Clips…). A video can be in several.</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          await onSubmit({ name: name.trim(), icon, description: description.trim() || null });
          setBusy(false);
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="category-name">Name</Label>
          <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label>Icon</Label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={icon === key}
                onClick={() => setIcon(icon === key ? null : key)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground",
                  icon === key && "border-foreground bg-white/10 text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="category-description">Description (optional)</Label>
          <Textarea id="category-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy || !name.trim()}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
