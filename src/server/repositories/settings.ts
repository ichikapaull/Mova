import { DEFAULT_SETTINGS, type Settings, settingsSchema, settingsUpdateSchema } from "@/lib/settings";
import { getDb, schema } from "@/server/db";

export function getSettings(): Settings {
  const rows = getDb().select().from(schema.settings).all();
  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      raw[row.key] = JSON.parse(row.value);
    } catch {
      // Ignore corrupt values; the default is used instead.
    }
  }
  // Validate each key separately so one bad value doesn't reset everything.
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const [key, value] of Object.entries(raw)) {
    const candidate = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, [key]: value });
    if (candidate.success && key in DEFAULT_SETTINGS) merged[key] = value;
  }
  return settingsSchema.parse(merged);
}

export function updateSettings(update: Partial<Settings>): Settings {
  const parsed = settingsUpdateSchema.parse(update);
  const db = getDb();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined) continue;
      tx.insert(schema.settings)
        .values({ key, value: JSON.stringify(value) })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: JSON.stringify(value) } })
        .run();
    }
  });
  return getSettings();
}
