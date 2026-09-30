"use client";

import { useLayoutEffect, useState } from "react";

const MIN_CARD_WIDTH = { small: 190, medium: 250, large: 330 } as const;
const GAP_X = 16;
/** Title + meta line below the thumbnail, plus row gap. */
const INFO_HEIGHT = 46;
const GAP_Y = 22;

export type GridLayout = { columns: number; cardWidth: number; rowHeight: number; gapX: number };

export function computeGridLayout(width: number, size: keyof typeof MIN_CARD_WIDTH): GridLayout {
  const min = MIN_CARD_WIDTH[size];
  const columns = Math.max(1, Math.floor((width + GAP_X) / (min + GAP_X)));
  const cardWidth = (width - GAP_X * (columns - 1)) / columns;
  return { columns, cardWidth, rowHeight: Math.round((cardWidth * 9) / 16 + INFO_HEIGHT + GAP_Y), gapX: GAP_X };
}

/** Measures a container and derives a responsive column count for the card grid. */
export function useGridLayout(ref: React.RefObject<HTMLElement | null>, size: keyof typeof MIN_CARD_WIDTH): GridLayout & { width: number } {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return { ...computeGridLayout(width || 1200, size), width };
}
