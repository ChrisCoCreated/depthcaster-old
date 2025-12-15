import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { polls, pollOptions, pollResponses } from "../lib/schema";
import { eq, asc } from "drizzle-orm";

const POLL_ID = "28d9d391-9c76-4bba-a746-f80e153624b6";

async function restorePollResponses() {
  try {
    console.log("Starting poll response restoration...");
    console.log(`Poll ID: ${POLL_ID}`);

    // Read the original responses file
    const originalData = JSON.parse(
      readFileSync("/Users/chris/Downloads/poll_responses original.json", "utf-8")
    );

    // Get current poll options ordered by order field
    const currentOptions = await db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.pollId, POLL_ID))
      .orderBy(asc(pollOptions.order));

    console.log(`\nCurrent poll options (${currentOptions.length}):`);
    currentOptions.forEach((opt, idx) => {
      console.log(`  ${idx + 1}. [${opt.id}] ${opt.optionText}`);
    });

    // Extract unique old option IDs from original responses
    const oldOptionIds = new Set<string>();
    originalData.forEach((response: any) => {
      if (response.choices) {
        Object.keys(response.choices).forEach((id) => oldOptionIds.add(id));
      }
    });

    console.log(`\nFound ${oldOptionIds.size} unique old option IDs in original responses`);

    // We need to map old IDs to new IDs by position
    // Since we don't have the original option texts, we'll map by order
    // This assumes the options were recreated in the same order
    const oldToNewMapping: Record<string, string> = {};
    
    // Get all current responses to see which old IDs map to which new IDs
    const currentResponses = await db
      .select()
      .from(pollResponses)
      .where(eq(pollResponses.pollId, POLL_ID));

    // Try to infer mapping from responses that have both old and new IDs
    // Look for responses that exist in both files
    const updatedData = JSON.parse(
      readFileSync("/Users/chris/Downloads/poll_responses updated.json", "utf-8")
    );

    // Create a mapping by comparing responses with same user_fid
    const responseMap = new Map<number, { original: any; updated: any }>();
    originalData.forEach((orig: any) => {
      const updated = updatedData.find((upd: any) => upd.user_fid === orig.user_fid);
      if (updated) {
        responseMap.set(orig.user_fid, { original: orig, updated: updated });
      }
    });

    // Build mapping from responses that have both
    responseMap.forEach(({ original, updated }) => {
      const origChoices = original.choices || {};
      const updChoices = updated.choices || {};
      
      // Map based on the choice values (love, like, meh, hate)
      // Group by choice value
      const origByChoice: Record<string, string[]> = {};
      const updByChoice: Record<string, string[]> = {};
      
      Object.entries(origChoices).forEach(([id, choice]) => {
        if (!origByChoice[choice as string]) {
          origByChoice[choice as string] = [];
        }
        origByChoice[choice as string].push(id);
      });
      
      Object.entries(updChoices).forEach(([id, choice]) => {
        if (!updByChoice[choice as string]) {
          updByChoice[choice as string] = [];
        }
        updByChoice[choice as string].push(id);
      });

      // For each choice value, try to map old IDs to new IDs
      Object.keys(origByChoice).forEach((choice) => {
        const origIds = origByChoice[choice];
        const updIds = updByChoice[choice];
        
        if (origIds.length === updIds.length && origIds.length === 1) {
          // Simple 1-to-1 mapping
          oldToNewMapping[origIds[0]] = updIds[0];
        }
      });
    });

    console.log(`\nInferred mapping from ${responseMap.size} matching responses:`);
    Object.entries(oldToNewMapping).forEach(([oldId, newId]) => {
      console.log(`  ${oldId} -> ${newId}`);
    });

    // If we don't have a complete mapping, map by order position
    // This assumes options were recreated in the same order
    const oldIdsArray = Array.from(oldOptionIds);
    if (oldIdsArray.length === currentOptions.length) {
      console.log("\nMapping remaining IDs by position (assuming same order):");
      oldIdsArray.forEach((oldId, idx) => {
        if (!oldToNewMapping[oldId] && currentOptions[idx]) {
          oldToNewMapping[oldId] = currentOptions[idx].id;
          console.log(`  ${oldId} -> ${currentOptions[idx].id} (position ${idx + 1})`);
        }
      });
    }

    // Update all responses
    console.log("\nUpdating responses...");
    let updatedCount = 0;
    let skippedCount = 0;

    for (const originalResponse of originalData) {
      const responseId = originalResponse.id;
      const originalChoices = originalResponse.choices || {};
      
      // Map old option IDs to new option IDs
      const newChoices: Record<string, string> = {};
      let hasUnmapped = false;
      
      Object.entries(originalChoices).forEach(([oldOptionId, choice]) => {
        const newOptionId = oldToNewMapping[oldOptionId];
        if (newOptionId) {
          newChoices[newOptionId] = choice as string;
        } else {
          console.warn(`  Warning: No mapping found for old option ID ${oldOptionId} in response ${responseId}`);
          hasUnmapped = true;
        }
      });

      if (hasUnmapped) {
        skippedCount++;
        continue;
      }

      // Update the response
      await db
        .update(pollResponses)
        .set({
          choices: newChoices,
          updatedAt: new Date(),
        })
        .where(eq(pollResponses.id, responseId));

      updatedCount++;
    }

    console.log(`\n✓ Restoration completed!`);
    console.log(`  - Updated: ${updatedCount} responses`);
    console.log(`  - Skipped: ${skippedCount} responses (unmapped options)`);
  } catch (error) {
    console.error("Error restoring poll responses:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

restorePollResponses();

