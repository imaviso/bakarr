import process from "node:process";
import { defineConfig } from "drizzle-kit";

const databaseFile = process.env["DATABASE_FILE"];

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: databaseFile ?? "./bakarr.sqlite",
  },
});
