"use client";

import { useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { clamp, cn } from "@/lib/utils";

/**
 * Scrubbable timeline with buffered ranges and a hover time tooltip.
 * Seeking is committed on pointer up; while dragging only the preview moves.
 */
export function SeekBar({
  currentTime,
  duration,
  buffered,
  onSeek,
  onScrubChange,
}: {
  currentTime: number;
  duration: number;
  buffered: Array<[number, number]>;
  onSeek: (time: number) => void;
  onScrubChange?: (scrubbing: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  const ratioAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };

  const safeDuration = duration > 0 ? duration : 0;
  const playedRatio = dragRatio ?? (safeDuration ? currentTime / safeDuration : 0);
  const tooltipRatio = dragRatio ?? hoverRatio;

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={-1}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(safeDuration)}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={`${formatDuration(currentTime)} of ${formatDuration(safeDuration)}`}
      className="group/seek relative flex h-5 cursor-pointer touch-none items-center"
      onPointerMove={(event) => {
        const ratio = ratioAt(event.clientX);
        setHoverRatio(ratio);
        if (dragRatio !== null) setDragRatio(ratio);
      }}
      onPointerLeave={() => setHoverRatio(null)}
      onPointerDown={(event) => {
        if (!safeDuration) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragRatio(ratioAt(event.clientX));
        onScrubChange?.(true);
      }}
      onPointerUp={(event) => {
        if (dragRatio === null) return;
        const ratio = ratioAt(event.clientX);
        setDragRatio(null);
        onScrubChange?.(false);
        onSeek(ratio * safeDuration);
      }}
      onPointerCancel={() => {
        setDragRatio(null);
        onScrubChange?.(false);
      }}
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-[height] duration-150 group-hover/seek:h-1.5">
        {safeDuration > 0 &&
          buffered.map(([start, end], i) => (
            <div
              key={i}
              className="absolute inset-y-0 bg-white/30"
              style={{ left: `${(start / safeDuration) * 100}%`, width: `${((end - start) / safeDuration) * 100}%` }}
            />
          ))}
        {hoverRatio !== null && dragRatio === null && (
          <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${hoverRatio * 100}%` }} />
        )}
        <div className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${playedRatio * 100}%` }} />
      </div>
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md transition-transform duration-150",
          dragRatio !== null ? "scale-110" : "scale-0 group-hover/seek:scale-100",
        )}
        style={{ left: `${playedRatio * 100}%` }}
      />
      {tooltipRatio !== null && safeDuration > 0 && (
        <div
          className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded-md bg-black/85 px-2 py-1 font-mono text-xs text-white tabular-nums shadow-lg"
          style={{ left: `clamp(24px, ${tooltipRatio * 100}%, calc(100% - 24px))` }}
        >
          {formatDuration(tooltipRatio * safeDuration)}
        </div>
      )}
    </div>
  );
}
