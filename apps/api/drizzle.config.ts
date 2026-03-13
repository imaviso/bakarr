import process from "node:process";
import { defineConfig } from "drizzle-kit";

const databaseFile = typeof Deno !== "undefined"
  ? Deno.env.get("DATABASE_FILE")
  : process.env.DATABASE_FILE;

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseFile ?? "./bakarr.sqlite",
  },
});
