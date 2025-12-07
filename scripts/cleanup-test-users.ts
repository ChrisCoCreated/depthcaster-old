import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { users, signInLogs } from "../lib/schema";
import { eq } from "drizzle-orm";

async function cleanupTestUsers() {
  try {
    console.log("🧹 Cleaning up test users and related data...\n");

    const testFids = [12345, 67890];

    for (const fid of testFids) {
      // Check if user exists
      const user = await db.select().from(users).where(eq(users.fid, fid)).limit(1);
      
      if (user.length > 0) {
        console.log(`Found test user with FID ${fid}, cleaning up...`);
        
        // Delete related sign-in logs first (due to foreign key)
        const deletedLogs = await db.delete(signInLogs).where(eq(signInLogs.userFid, fid));
        console.log(`  - Deleted sign-in logs for user ${fid}`);
        
        // Delete the user
        await db.delete(users).where(eq(users.fid, fid));
        console.log(`  - Deleted user ${fid}`);
      } else {
        console.log(`No test user found with FID ${fid}`);
      }
    }

    // Also clean up any sign-in logs without userFid that have test error messages
    const testErrorMessages = ["No user FID provided"];
    for (const errorMsg of testErrorMessages) {
      await db.delete(signInLogs).where(eq(signInLogs.error, errorMsg));
      console.log(`  - Cleaned up logs with error: ${errorMsg}`);
    }

    console.log("\n✅ Cleanup completed!");
  } catch (error: any) {
    console.error("❌ Error during cleanup:", error.message || error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

cleanupTestUsers();

