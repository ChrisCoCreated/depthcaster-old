import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Load environment variables if not already loaded (for scripts)
const dbUrl = process.env.POSTGRES_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (typeof process !== "undefined" && !dbUrl) {
  try {
    const { config } = require("dotenv");
    const { resolve } = require("path");
    config({ path: resolve(process.cwd(), ".env.local") });
    config({ path: resolve(process.cwd(), ".env") });
  } catch (e) {
    // dotenv not available or already loaded
  }
}

// Check again after loading dotenv
const finalDbUrl = process.env.POSTGRES_DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!finalDbUrl) {
  throw new Error("Database URL is not set. Please set POSTGRES_DATABASE_URL, POSTGRES_URL, or DATABASE_URL in environment variables");
}

const sql = neon(finalDbUrl);
export const db = drizzle(sql, { schema });
