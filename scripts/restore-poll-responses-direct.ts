import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { pollResponses } from "../lib/schema";
import { eq } from "drizzle-orm";

const POLL_ID = "28d9d391-9c76-4bba-a746-f80e153624b6";

async function restorePollResponsesDirect() {
  try {
    console.log("Restoring poll responses directly from original file...");
    console.log(`Poll ID: ${POLL_ID}\n`);

    // Read the original responses file
    const originalData = JSON.parse(
      readFileSync("/Users/chris/Downloads/poll_responses original.json", "utf-8")
    );

    console.log(`Found ${originalData.length} responses to restore\n`);

    // Restore each response exactly as it was
    let restoredCount = 0;
    let errorCount = 0;

    for (const originalResponse of originalData) {
      try {
        await db
          .update(pollResponses)
          .set({
            choices: originalResponse.choices || null,
            rankings: originalResponse.rankings || null,
            allocations: originalResponse.allocations || null,
            updatedAt: new Date(originalResponse.updated_at),
          })
          .where(eq(pollResponses.id, originalResponse.id));

        restoredCount++;
        if (restoredCount % 5 === 0) {
          console.log(`  Restored ${restoredCount}/${originalData.length} responses...`);
        }
      } catch (error: any) {
        console.error(`  Error restoring response ${originalResponse.id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n✓ Restoration completed!`);
    console.log(`  - Restored: ${restoredCount} responses`);
    console.log(`  - Errors: ${errorCount} responses`);
    console.log(`\nNote: Responses have been restored with their original option IDs.`);
    console.log(`If the poll options were changed, you may need to restore the original poll options separately.`);
  } catch (error) {
    console.error("Error restoring poll responses:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

restorePollResponsesDirect();

