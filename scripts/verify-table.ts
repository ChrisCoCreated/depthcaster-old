import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function verifyTable() {
  try {
    console.log("Verifying user_reaction_sync_state table exists...");
    
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_reaction_sync_state'
      );
    `);
    
    const exists = result.rows[0]?.exists;
    
    if (exists) {
      console.log("✅ Table 'user_reaction_sync_state' exists!");
      
      // Check columns
      const columns = await db.execute(sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'user_reaction_sync_state'
        ORDER BY ordinal_position;
      `);
      
      console.log("\nColumns:");
      columns.rows.forEach((row: any) => {
        console.log(`  - ${row.column_name}: ${row.data_type}`);
      });
      
      // Check indexes
      const indexes = await db.execute(sql`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'user_reaction_sync_state';
      `);
      
      console.log("\nIndexes:");
      indexes.rows.forEach((row: any) => {
        console.log(`  - ${row.indexname}`);
      });
      
      // Check constraints
      const constraints = await db.execute(sql`
        SELECT conname, contype 
        FROM pg_constraint 
        WHERE conrelid = 'user_reaction_sync_state'::regclass;
      `);
      
      console.log("\nConstraints:");
      constraints.rows.forEach((row: any) => {
        console.log(`  - ${row.conname} (${row.contype})`);
      });
    } else {
      console.log("❌ Table 'user_reaction_sync_state' does NOT exist!");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error verifying table:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

verifyTable();
