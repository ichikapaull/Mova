import { z } from "zod";

/** User settings. Stored as one JSON row per key in the `settings` table. */
export const settingsSchema = z.object({
  setupCompleted: z.boolean().default(false),

  // Preview generation
  hoverPreviewEnabled: z.boolean().default(true),
  hoverDelayMs: z.number().int().min(200).max(2000).default(600),
  previewGeneration: z.enum(["background", "on-demand", "off"]).default("background"),
  previewLengthSec: z.number().int().min(4).max(20).default(10),
  previewHeight: z.union([z.literal(240), z.literal(360), z.literal(480)]).default(360),

  // Player
  autoplayNextEpisode: z.boolean().default(true),
  autoplayCountdownSec: z.number().int().min(3).max(30).default(5),
  resumePlayback: z.boolean().default(true),
  completedThreshold: z.number().min(0.5).max(1).default(0.92),

  // Thumbnails
  thumbnailPosition: z.number().min(0.05).max(0.9).default(0.25),

  // Appearance
  gridSize: z.enum(["small", "medium", "large"]).default("medium"),

  // Library
  watchFolders: z.boolean().default(true),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/** Parses a partial update coming from the client, dropping unknown keys. */
export const settingsUpdateSchema = settingsSchema.partial();

/** Settings the client needs everywhere (card hover behaviour, grid size, …). */
export type ClientSettings = Pick<
  Settings,
  "hoverPreviewEnabled" | "hoverDelayMs" | "previewGeneration" | "gridSize" | "autoplayNextEpisode" | "autoplayCountdownSec" | "resumePlayback" | "completedThreshold"
>;

export function toClientSettings(settings: Settings): ClientSettings {
  return {
    hoverPreviewEnabled: settings.hoverPreviewEnabled,
    hoverDelayMs: settings.hoverDelayMs,
    previewGeneration: settings.previewGeneration,
    gridSize: settings.gridSize,
    autoplayNextEpisode: settings.autoplayNextEpisode,
    autoplayCountdownSec: settings.autoplayCountdownSec,
    resumePlayback: settings.resumePlayback,
    completedThreshold: settings.completedThreshold,
  };
}
