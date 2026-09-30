"use client";

import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Vertical list reorderable by drag & drop (native HTML5 DnD) or keyboard
 * (Alt+↑/↓ on the handle, or the arrow buttons). Calls `onReorder` once per drop.
 * `groupOf` restricts moves to items of the same group (e.g. a season).
 */
export function SortableList<T extends { id: number }>({
  items,
  onReorder,
  renderItem,
  groupOf,
  renderGroupHeader,
}: {
  items: T[];
  onReorder: (orderedIds: number[]) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  groupOf?: (item: T) => string | number;
  renderGroupHeader?: (item: T) => React.ReactNode;
}) {
  const [order, setOrder] = useState(items);
  const [sourceItems, setSourceItems] = useState(items);
  const [dragId, setDragId] = useState<number | null>(null);
  // Reset the local order when the server sends a new list.
  if (sourceItems !== items) {
    setSourceItems(items);
    setOrder(items);
  }

  const sameGroup = (a: T, b: T) => !groupOf || groupOf(a) === groupOf(b);

  const move = (list: T[], fromId: number, toIndex: number): T[] => {
    const from = list.findIndex((item) => item.id === fromId);
    if (from === -1 || from === toIndex) return list;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(toIndex, 0, moved!);
    return next;
  };

  const commit = (next: T[]) => {
    setOrder(next);
    if (next.some((item, i) => item.id !== items[i]?.id)) onReorder(next.map((item) => item.id));
  };

  const moveBy = (id: number, delta: -1 | 1) => {
    const index = order.findIndex((item) => item.id === id);
    const target = order[index + delta];
    if (!target || !sameGroup(order[index]!, target)) return;
    commit(move(order, id, index + delta));
  };

  return (
    <ol className="flex flex-col gap-1">
      {order.map((item, index) => {
        const previous = order[index - 1];
        const showHeader = renderGroupHeader && groupOf && (!previous || groupOf(previous) !== groupOf(item));
        return (
          <li key={item.id} className="list-none">
            {showHeader && renderGroupHeader(item)}
            <div
              draggable
              onDragStart={(event) => {
                setDragId(item.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(item.id));
              }}
              onDragOver={(event) => {
                if (dragId == null || dragId === item.id) return;
                const dragged = order.find((o) => o.id === dragId);
                if (!dragged || !sameGroup(dragged, item)) return;
                event.preventDefault();
                setOrder((current) => move(current, dragId, current.findIndex((o) => o.id === item.id)));
              }}
              onDrop={(event) => event.preventDefault()}
              onDragEnd={() => {
                setDragId(null);
                commit(order);
              }}
              className={cn(
                "group/sortable flex items-center gap-2 rounded-lg border border-transparent bg-surface px-2 py-2 transition-[background-color,border-color,opacity] duration-150 hover:border-border hover:bg-surface-elevated",
                dragId === item.id && "opacity-40",
              )}
            >
              <div className="flex shrink-0 flex-col items-center">
                <button
                  type="button"
                  aria-label="Drag to reorder (Alt+Arrow keys)"
                  onKeyDown={(event) => {
                    if (event.altKey && event.key === "ArrowUp") {
                      event.preventDefault();
                      moveBy(item.id, -1);
                    }
                    if (event.altKey && event.key === "ArrowDown") {
                      event.preventDefault();
                      moveBy(item.id, 1);
                    }
                  }}
                  className="cursor-grab rounded p-1 text-subtle-foreground hover:text-foreground active:cursor-grabbing"
                >
                  <GripVerticalIcon className="size-4" />
                </button>
              </div>
              <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
              <div className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover/sortable:opacity-100 focus-within:opacity-100">
                <button type="button" aria-label="Move up" onClick={() => moveBy(item.id, -1)} className="rounded p-0.5 text-subtle-foreground hover:text-foreground">
                  <ChevronUpIcon className="size-3.5" />
                </button>
                <button type="button" aria-label="Move down" onClick={() => moveBy(item.id, 1)} className="rounded p-0.5 text-subtle-foreground hover:text-foreground">
                  <ChevronDownIcon className="size-3.5" />
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
