"use client";

import { Link2Icon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { MediaCard } from "@/components/media/media-card";
import { useMediaActions } from "@/components/media/media-actions";
import { MediaPickerDialog } from "@/components/media/media-picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { callAction } from "@/lib/client/run-action";
import type { MediaListItem } from "@/lib/library-query";
import { cn } from "@/lib/utils";
import { addRelationAction, removeRelationAction } from "@/server/actions/media";

type RelationItem = MediaListItem & { relationId: number };
type RelationKind = "related" | "continuedBy" | "continues";

const KIND_LABEL: Record<RelationKind, string> = {
  related: "Related",
  continuedBy: "Continues in",
  continues: "Continuation of",
};

export function RelatedVideos({
  mediaId,
  relations,
}: {
  mediaId: number;
  relations: { related: RelationItem[]; continuedBy: RelationItem[]; continues: RelationItem[] };
}) {
  const actions = useMediaActions();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RelationKind>("related");
  const all: Array<RelationItem & { kind: RelationKind }> = [
    ...relations.continues.map((r) => ({ ...r, kind: "continues" as const })),
    ...relations.continuedBy.map((r) => ({ ...r, kind: "continuedBy" as const })),
    ...relations.related.map((r) => ({ ...r, kind: "related" as const })),
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold tracking-tight">Related Videos</h2>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Link2Icon /> Link video
        </Button>
      </div>
      {all.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Link videos that belong together — e.g. “Part 2 continues this video” — to get Next/Previous in the player.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-6">
          {all.map((item) => (
            <div key={item.relationId} className="relative flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium tracking-wider text-subtle-foreground uppercase">{KIND_LABEL[item.kind]}</span>
                <button
                  type="button"
                  aria-label="Remove link"
                  onClick={async () => {
                    if ((await callAction(removeRelationAction(item.relationId))) !== undefined) actions.refresh();
                  }}
                  className="rounded p-0.5 text-subtle-foreground hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
              <MediaCard item={item} />
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <MediaPickerDialog
            title="Link a video"
            excludeIds={[mediaId, ...all.map((a) => a.id)]}
            confirmLabel={() => "Link"}
            onConfirm={async ([otherId]) => {
              if (otherId == null) return;
              const action =
                kind === "related"
                  ? addRelationAction(mediaId, otherId, "related")
                  : kind === "continuedBy"
                    ? addRelationAction(mediaId, otherId, "continuation")
                    : addRelationAction(otherId, mediaId, "continuation");
              if ((await callAction(action, { success: "Linked" })) !== undefined) {
                setOpen(false);
                actions.refresh();
              }
            }}
          >
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["related", "Related video"],
                  ["continuedBy", "Selected video continues this one"],
                  ["continues", "This video continues the selected one"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    kind === value ? "border-foreground bg-foreground text-background" : "border-border-strong hover:bg-white/[0.06]",
                  )}
                >
                  {value === "related" ? <PlusIcon className="mr-1 inline size-3" /> : null}
                  {label}
                </button>
              ))}
            </div>
          </MediaPickerDialog>
        )}
      </Dialog>
    </section>
  );
}
