/**
 * Applies pending SQL migrations from ./drizzle to the app database.
 * Runs with Node's built-in TypeScript support: `node scripts/db-migrate.ts`.
 * The app also applies migrations automatically on startup.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dataDir = path.resolve(process.env.MOVA_DATA_DIR ?? path.join(process.cwd(), "data"));
const dbPath = path.join(dataDir, "app.db");

fs.mkdirSync(dataDir, { recursive: true });
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });
sqlite.close();

process.stdout.write(`Database is up to date: ${dbPath}\n`);
