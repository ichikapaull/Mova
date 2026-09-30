import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Natural string compare: "Episode 2" < "Episode 10". */
export const naturalCompare = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;
