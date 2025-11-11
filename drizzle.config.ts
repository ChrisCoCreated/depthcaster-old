import type { Config } from "drizzle-kit";

const dbUrl = process.env.POSTGRES_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("Database URL is not set. Please set POSTGRES_DATABASE_URL, POSTGRES_URL, or DATABASE_URL in environment variables");
}

export default {
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
} satisfies Config;

