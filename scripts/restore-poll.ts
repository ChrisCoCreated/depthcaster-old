import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../lib/db";
import { polls, pollOptions } from "../lib/schema";
import { eq, sql } from "drizzle-orm";

// Simple CSV parser that handles quoted fields with escaped quotes
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote (double quote)
        current += '"';
        i++; // Skip next quote
      } else if (inQuotes && nextChar === ',') {
        // End of quoted field
        inQuotes = false;
      } else if (!inQuotes) {
        // Start of quoted field
        inQuotes = true;
      } else {
        // End quote
        inQuotes = false;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current);
  return result;
}

async function restorePoll() {
  try {
    console.log("Restoring poll from CSV files...");

    // Read CSV files
    const pollsCsv = readFileSync("/Users/chris/Downloads/polls.csv", "utf-8");
    const optionsCsv = readFileSync("/Users/chris/Downloads/poll_options.csv", "utf-8");

    // Parse polls CSV (skip header)
    const pollLines = pollsCsv.split("\n").slice(1).filter(line => line.trim());
    if (pollLines.length === 0) {
      throw new Error("No poll data found in CSV");
    }

    // Parse first poll line
    const pollFields = parseCSVLine(pollLines[0]);
    console.log("Parsed fields:", pollFields.map((f, i) => `[${i}]: ${f.substring(0, 50)}`));
    
    if (pollFields.length < 9) {
      throw new Error(`Failed to parse poll CSV. Expected 9 fields, got ${pollFields.length}`);
    }

    const [id, castHash, question, createdBy, createdAt, updatedAt, pollType, choicesJson, slug] = pollFields;

    // Parse choices JSON - handle escaped quotes
    let choices: string[] | null = null;
    try {
      // Replace double quotes with single quotes for JSON parsing
      const cleanedChoices = choicesJson.replace(/""/g, '"');
      choices = JSON.parse(cleanedChoices);
    } catch (e) {
      console.warn("Failed to parse choices JSON:", e);
      console.warn("Raw choices field:", choicesJson);
    }

    console.log(`\nRestoring poll:`);
    console.log(`  ID: ${id}`);
    console.log(`  Question: ${question}`);
    console.log(`  Cast hash: ${castHash}`);
    console.log(`  Poll type: ${pollType}`);
    console.log(`  Choices: ${JSON.stringify(choices)}`);
    console.log(`  Slug: ${slug || "(none)"}`);
    console.log(`  Created by: ${createdBy}`);
    console.log(`  Created at: ${createdAt}`);

    // Check if poll already exists
    const existingPoll = await db
      .select()
      .from(polls)
      .where(eq(polls.castHash, castHash))
      .limit(1);

    if (existingPoll.length > 0) {
      console.log("\nPoll already exists. Updating...");
      // Update existing poll
      await db
        .update(polls)
        .set({
          question,
          pollType: pollType as "ranking" | "choice" | "distribution",
          choices: choices || null,
          slug: slug || undefined,
          updatedAt: new Date(updatedAt),
        })
        .where(eq(polls.castHash, castHash));

      const pollId = existingPoll[0].id;

      // Delete existing options
      await db.delete(pollOptions).where(eq(pollOptions.pollId, pollId));

      // Insert options
      await insertOptions(pollId, optionsCsv);
    } else {
      console.log("\nCreating new poll...");
      // Insert poll with exact ID and timestamps
      await db.execute(sql`
        INSERT INTO polls (id, cast_hash, question, created_by, created_at, updated_at, poll_type, choices, slug)
        VALUES (
          ${id}::uuid,
          ${castHash},
          ${question},
          ${parseInt(createdBy)}::bigint,
          ${createdAt}::timestamp,
          ${updatedAt}::timestamp,
          ${pollType},
          ${choices ? JSON.stringify(choices) : null}::jsonb,
          ${slug || null}
        )
        ON CONFLICT (cast_hash) DO UPDATE SET
          question = EXCLUDED.question,
          poll_type = EXCLUDED.poll_type,
          choices = EXCLUDED.choices,
          slug = EXCLUDED.slug,
          updated_at = EXCLUDED.updated_at
      `);

      // Insert options
      await insertOptions(id, optionsCsv);
    }

    console.log("\n✓ Poll restored successfully!");
  } catch (error: any) {
    console.error("Error restoring poll:", error.message || error);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

async function insertOptions(pollId: string, optionsCsv: string) {
  // Parse options CSV - need to handle multi-line entries
  // Split by lines but reconstruct multi-line entries
  const lines = optionsCsv.split("\n");
  const optionLines: string[] = [];
  let currentLine = "";
  let quoteCount = 0;
  
  for (const line of lines) {
    if (line.trim() === "") continue;
    
    currentLine += (currentLine ? "\n" : "") + line;
    quoteCount += (line.match(/"/g) || []).length;
    
    // If we have an even number of quotes, we've completed a CSV row
    if (quoteCount % 2 === 0 && currentLine.trim()) {
      optionLines.push(currentLine);
      currentLine = "";
      quoteCount = 0;
    }
  }
  
  // Skip header
  const dataLines = optionLines.slice(1);
  
  console.log(`\nInserting ${dataLines.length} options...`);

  for (const line of dataLines) {
    const fields = parseCSVLine(line);
    if (fields.length < 6) {
      console.warn(`Skipping malformed option line (${fields.length} fields): ${line.substring(0, 50)}...`);
      continue;
    }

    const [optionId, pollIdFromCsv, optionText, order, createdAt, ...markdownParts] = fields;
    const markdown = markdownParts.join(",").replace(/^"|"$/g, "");

    try {
      await db.execute(sql`
        INSERT INTO poll_options (id, poll_id, option_text, "order", created_at, markdown)
        VALUES (
          ${optionId}::uuid,
          ${pollId}::uuid,
          ${optionText},
          ${parseInt(order)}::integer,
          ${createdAt}::timestamp,
          ${markdown || null}
        )
        ON CONFLICT DO NOTHING
      `);
      console.log(`  ✓ Inserted option: ${optionText} (order ${order})`);
    } catch (err: any) {
      console.error(`  ✗ Failed to insert option ${optionText}:`, err.message);
    }
  }
}

restorePoll();
