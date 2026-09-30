import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.MOVA_DATA_DIR ? `${process.env.MOVA_DATA_DIR}/app.db` : "./data/app.db",
  },
});
