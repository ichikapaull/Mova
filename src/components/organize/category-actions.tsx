"use client";

import { MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CategoryFormDialog } from "@/components/organize/category-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { invalidateLibraryCache } from "@/lib/client/library-cache";
import { callAction } from "@/lib/client/run-action";
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/server/actions/organize";
import { seedDefaultCategoriesAction } from "@/server/actions/library";

export function NewCategoryButton({ showDefaults }: { showDefaults?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      {showDefaults && (
        <Button
          variant="secondary"
          onClick={async () => {
            if ((await callAction(seedDefaultCategoriesAction(), { success: "Default categories added" })) !== undefined) router.refresh();
          }}
        >
          Add defaults
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <Button onClick={() => setOpen(true)}>
          <PlusIcon /> New category
        </Button>
        {open && (
          <CategoryFormDialog
            title="New category"
            submitLabel="Create"
            onSubmit={async (value) => {
              if ((await callAction(createCategoryAction(value), { success: "Category created" })) !== undefined) {
                setOpen(false);
                router.refresh();
              }
            }}
          />
        )}
      </Dialog>
    </>
  );
}

export function CategoryManageMenu({
  category,
}: {
  category: { id: number; name: string; icon: string | null; description: string | null };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon-sm" aria-label="Category options">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMode("edit")}>
            <PencilIcon /> Edit category
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setMode("delete")}>
            <Trash2Icon /> Delete category
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        {mode === "edit" && (
          <CategoryFormDialog
            title="Edit category"
            submitLabel="Save"
            initial={category}
            onSubmit={async (value) => {
              if ((await callAction(updateCategoryAction(category.id, value), { success: "Saved" })) !== undefined) {
                setMode(null);
                invalidateLibraryCache();
                router.refresh();
              }
            }}
          />
        )}
        {mode === "delete" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete “{category.name}”?</DialogTitle>
              <DialogDescription>Videos stay in your library; they just won&apos;t belong to this category anymore.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMode(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if ((await callAction(deleteCategoryAction(category.id), { success: "Category deleted" })) !== undefined) {
                    invalidateLibraryCache();
                    router.push("/categories");
                  }
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
