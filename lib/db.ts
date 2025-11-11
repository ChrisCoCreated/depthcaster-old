import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Load environment variables if not already loaded (for scripts)
if (typeof process !== "undefined" && !process.env.DATABASE_URL) {
  try {
    const { config } = require("dotenv");
    const { resolve } = require("path");
    config({ path: resolve(process.cwd(), ".env.local") });
    config({ path: resolve(process.cwd(), ".env") });
  } catch (e) {
    // dotenv not available or already loaded
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in environment variables");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
