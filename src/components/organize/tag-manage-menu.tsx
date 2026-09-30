"use client";

import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { invalidateLibraryCache } from "@/lib/client/library-cache";
import { callAction } from "@/lib/client/run-action";
import { deleteTagAction, renameTagAction } from "@/server/actions/organize";

export function TagManageMenu({ tag }: { tag: { id: number; name: string } }) {
  const router = useRouter();
  const [mode, setMode] = useState<"rename" | "delete" | null>(null);
  const [name, setName] = useState(tag.name);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon-sm" aria-label="Tag options">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMode("rename")}>
            <PencilIcon /> Rename tag
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setMode("delete")}>
            <Trash2Icon /> Delete tag
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        {mode === "rename" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename tag</DialogTitle>
              <DialogDescription>Renaming to an existing tag merges both.</DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={async (event) => {
                event.preventDefault();
                const ok = await callAction(renameTagAction(tag.id, name), { success: "Tag renamed" });
                if (ok !== undefined) {
                  setMode(null);
                  invalidateLibraryCache();
                  router.refresh();
                }
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
              <DialogFooter>
                <Button type="submit" disabled={!name.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
        {mode === "delete" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete “{tag.name}”?</DialogTitle>
              <DialogDescription>The tag is removed from all videos. Videos themselves are not affected.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMode(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const ok = await callAction(deleteTagAction(tag.id), { success: "Tag deleted" });
                  if (ok !== undefined) {
                    invalidateLibraryCache();
                    router.push("/tags");
                  }
                }}
              >
                Delete tag
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
