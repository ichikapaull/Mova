"use client";

import { FolderSearchIcon } from "lucide-react";
import { useState } from "react";
import { FolderBrowser } from "@/components/settings/folder-browser";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { callAction } from "@/lib/client/run-action";
import { addSourceAction } from "@/server/actions/library";

export function AddFolderDialog({
  categories,
  onAdded,
}: {
  categories: Array<{ id: number; name: string }>;
  onAdded: () => void;
}) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Add media folder</DialogTitle>
        <DialogDescription>Mova indexes videos in this folder and all sub-folders. Files are never moved, copied or modified.</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const created = await callAction(
            addSourceAction({
              path,
              name: name.trim() || undefined,
              defaultCategoryId: categoryId === "none" ? null : Number(categoryId),
            }),
            { success: (source) => `Added “${source.name}” — scanning…` },
          );
          setBusy(false);
          if (created) onAdded();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="folder-path">Folder path</Label>
          <div className="flex gap-2">
            <Input
              id="folder-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/home/you/Videos/Anime"
              className="font-mono text-[13px]"
              autoFocus
            />
            <Button type="button" variant="secondary" onClick={() => setBrowsing((b) => !b)}>
              <FolderSearchIcon /> Browse
            </Button>
          </div>
        </div>
        {browsing && <FolderBrowser value={path} onChange={setPath} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="folder-name">Display name (optional)</Label>
            <Input id="folder-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Folder name" maxLength={100} />
          </div>
          <div className="grid gap-1.5">
            <Label>Default category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy || !path.trim()}>
            Add & scan
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
