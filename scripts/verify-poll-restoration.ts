import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { polls, pollOptions, pollResponses } from "../lib/schema";
import { eq, asc } from "drizzle-orm";

const POLL_ID = "28d9d391-9c76-4bba-a746-f80e153624b6";

async function verifyRestoration() {
  try {
    console.log("Verifying poll response restoration...");
    console.log(`Poll ID: ${POLL_ID}\n`);

    // Get current poll options
    const currentOptions = await db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.pollId, POLL_ID))
      .orderBy(asc(pollOptions.order));

    const optionIds = new Set(currentOptions.map(opt => opt.id));
    console.log(`Current poll has ${currentOptions.length} options:`);
    currentOptions.forEach((opt, idx) => {
      console.log(`  ${idx + 1}. [${opt.id}] ${opt.optionText}`);
    });

    // Get all responses
    const responses = await db
      .select()
      .from(pollResponses)
      .where(eq(pollResponses.pollId, POLL_ID));

    console.log(`\nFound ${responses.length} responses`);

    // Check each response for invalid option IDs
    let validResponses = 0;
    let invalidResponses = 0;
    const invalidOptionIds = new Set<string>();

    responses.forEach((response) => {
      if (response.choices) {
        let choicesObj: Record<string, string> | null = null;
        if (typeof response.choices === 'string') {
          try {
            choicesObj = JSON.parse(response.choices);
          } catch (e) {
            console.error(`Failed to parse choices for response ${response.id}:`, e);
            return;
          }
        } else if (typeof response.choices === 'object' && response.choices !== null) {
          choicesObj = response.choices as Record<string, string>;
        }

        if (choicesObj) {
          const choiceOptionIds = Object.keys(choicesObj);
          const hasInvalid = choiceOptionIds.some(id => !optionIds.has(id));
          
          if (hasInvalid) {
            invalidResponses++;
            choiceOptionIds.forEach(id => {
              if (!optionIds.has(id)) {
                invalidOptionIds.add(id);
              }
            });
          } else {
            validResponses++;
          }
        }
      }
    });

    console.log(`\nResponse validation:`);
    console.log(`  - Valid responses: ${validResponses}`);
    console.log(`  - Invalid responses: ${invalidResponses} (reference non-existent options)`);
    
    if (invalidOptionIds.size > 0) {
      console.log(`\nInvalid option IDs found in responses:`);
      Array.from(invalidOptionIds).forEach(id => {
        console.log(`  - ${id}`);
      });
    }

    // Show sample of restored responses
    console.log(`\nSample of restored responses (first 3):`);
    responses.slice(0, 3).forEach((response, idx) => {
      console.log(`\n  Response ${idx + 1} (user_fid: ${response.userFid}):`);
      if (response.choices) {
        let choicesObj: Record<string, string> | null = null;
        if (typeof response.choices === 'string') {
          try {
            choicesObj = JSON.parse(response.choices);
          } catch (e) {
            return;
          }
        } else if (typeof response.choices === 'object' && response.choices !== null) {
          choicesObj = response.choices as Record<string, string>;
        }
        
        if (choicesObj) {
          Object.entries(choicesObj).forEach(([optionId, choice]) => {
            const option = currentOptions.find(opt => opt.id === optionId);
            const optionText = option ? option.optionText : `[Unknown: ${optionId}]`;
            const isValid = optionIds.has(optionId);
            console.log(`    ${isValid ? '✓' : '✗'} ${optionText}: ${choice}`);
          });
        }
      }
    });

  } catch (error) {
    console.error("Error verifying restoration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

verifyRestoration();

