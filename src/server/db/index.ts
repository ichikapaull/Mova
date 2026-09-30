import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { DB_PATH, MIGRATIONS_DIR } from "@/server/config";
import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export class DatabaseUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Database unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "DatabaseUnavailableError";
  }
}

/** Opens (and migrates) a database. Use ":memory:" in tests. */
export function createDatabase(file: string, migrationsFolder = MIGRATIONS_DIR): AppDatabase {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}

const globalForDb = globalThis as unknown as { __movaDb?: AppDatabase };

/** Process-wide database connection (survives dev hot reloads). */
export function getDb(): AppDatabase {
  if (!globalForDb.__movaDb) {
    try {
      globalForDb.__movaDb = createDatabase(DB_PATH);
    } catch (error) {
      throw new DatabaseUnavailableError(error);
    }
  }
  return globalForDb.__movaDb;
}

/** Test hook: swap the process-wide connection. */
export function setDbForTesting(db: AppDatabase | undefined): void {
  globalForDb.__movaDb = db;
}

export { schema };
