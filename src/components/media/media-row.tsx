"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MediaCard } from "@/components/media/media-card";
import type { MediaListItem } from "@/lib/library-query";
import { cn } from "@/lib/utils";

/** Horizontally scrolling row of cards with edge arrows (Netflix-style shelf). */
export function MediaRow({
  title,
  href,
  items,
  clickAction,
  list,
  actions,
  children,
}: {
  title: string;
  href?: string;
  items?: MediaListItem[];
  clickAction?: "details" | "play";
  /** Playback context forwarded to the player (e.g. a shuffle order). */
  list?: string | null;
  /** Extra controls next to "See all". */
  actions?: React.ReactNode;
  /** Custom cards instead of media items (series, collections). */
  children?: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const updateEdges = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    updateEdges();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateEdges, items?.length]);

  const scrollBy = (direction: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="group/row relative">
      <div className="mb-3 flex items-baseline justify-between gap-4 px-6 lg:px-10">
        <h2 className="text-[17px] font-semibold tracking-tight text-foreground">{title}</h2>
        <div className="flex items-center gap-3">
          {actions}
          {href && (
            <Link href={href} className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
              See all
            </Link>
          )}
        </div>
      </div>
      <div className="relative">
        <div
          ref={scroller}
          onScroll={updateEdges}
          className="scrollbar-none flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto overscroll-x-contain px-6 pt-2 pb-4 lg:scroll-px-10 lg:gap-4 lg:px-10"
        >
          {items?.map((item, index) => (
            <div key={item.id} className="w-[min(78vw,270px)] shrink-0 snap-start lg:w-[clamp(240px,19vw,310px)]">
              <MediaCard item={item} clickAction={clickAction} list={list} eager={index < 4} />
            </div>
          ))}
          {children}
        </div>
        <EdgeButton side="left" hidden={edges.start} onClick={() => scrollBy(-1)} />
        <EdgeButton side="right" hidden={edges.end} onClick={() => scrollBy(1)} />
      </div>
    </section>
  );
}

function EdgeButton({ side, hidden, onClick }: { side: "left" | "right"; hidden: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        "absolute top-2 bottom-4 z-30 hidden w-10 items-center justify-center text-white opacity-0 transition-opacity duration-200 md:flex lg:w-12",
        side === "left" ? "left-0 bg-gradient-to-r from-background via-background/70 to-transparent" : "right-0 bg-gradient-to-l from-background via-background/70 to-transparent",
        !hidden && "group-hover/row:opacity-100",
        hidden && "pointer-events-none",
      )}
    >
      <Icon className="size-7" />
    </button>
  );
}

/** Card-sized wrapper for non-media shelf items (series, collections). */
export function RowSlot({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("w-[min(78vw,270px)] shrink-0 snap-start lg:w-[clamp(240px,19vw,310px)]", className)}>{children}</div>;
}
