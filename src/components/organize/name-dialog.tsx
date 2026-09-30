"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Simple name + description form used for collections and series. */
export function NameDescriptionDialog({
  title,
  description,
  nameLabel = "Name",
  initial,
  submitLabel,
  onSubmit,
}: {
  title: string;
  description?: string;
  nameLabel?: string;
  initial?: { name?: string; description?: string | null };
  submitLabel: string;
  onSubmit: (value: { name: string; description: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [text, setText] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          await onSubmit({ name: name.trim(), description: text.trim() || null });
          setBusy(false);
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="nd-name">{nameLabel}</Label>
          <Input id="nd-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nd-description">Description (optional)</Label>
          <Textarea id="nd-description" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={5000} />
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
