import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { feedViewSessions } from "../lib/schema";

/**
 * Fix feed_view_sessions by:
 * 1. Identifying duplicate sessions (within 60 seconds for same user/feed)
 * 2. Calculating actual durations (difference between consecutive records)
 * 3. Keeping only the final record per session with correct duration
 * 4. Removing all intermediate duplicate records
 */
async function fixFeedSessionDurations() {
  try {
    console.log("Starting fix of feed_view_sessions durations...");
    console.log("⚠️  WARNING: This will modify production data.\n");
    
    const dryRun = process.env.DRY_RUN !== 'false';
    
    if (dryRun) {
      console.log("🔍 DRY RUN MODE - No records will be modified");
      console.log("   Set DRY_RUN=false to actually fix durations\n");
    }

    // Step 1: Identify sessions that need fixing
    // For each user/feed combination, find records within 60 seconds
    // and calculate which ones are duplicates with cumulative durations
    console.log("Step 1: Identifying duplicate sessions...");
    const duplicateSessions = await db.execute(sql`
      WITH session_sequences AS (
        SELECT 
          id,
          user_fid,
          feed_type,
          duration_seconds,
          created_at,
          LAG(created_at) OVER (
            PARTITION BY user_fid, feed_type 
            ORDER BY created_at
          ) as prev_created_at,
          LAG(duration_seconds) OVER (
            PARTITION BY user_fid, feed_type 
            ORDER BY created_at
          ) as prev_duration_seconds,
          ROW_NUMBER() OVER (
            PARTITION BY user_fid, feed_type 
            ORDER BY created_at
          ) as seq_num
        FROM feed_view_sessions
        WHERE user_fid IS NOT NULL
        ORDER BY user_fid, feed_type, created_at
      ),
      potential_duplicates AS (
        SELECT 
          id,
          user_fid,
          feed_type,
          duration_seconds,
          created_at,
          prev_created_at,
          prev_duration_seconds,
          seq_num,
          EXTRACT(EPOCH FROM (created_at - prev_created_at)) as seconds_since_prev,
          CASE 
            WHEN prev_duration_seconds IS NOT NULL AND duration_seconds >= prev_duration_seconds
            THEN duration_seconds - prev_duration_seconds
            ELSE NULL
          END as calculated_duration
        FROM session_sequences
        WHERE prev_created_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (created_at - prev_created_at)) <= 60
      )
      SELECT 
        id,
        user_fid,
        feed_type,
        duration_seconds as current_duration,
        calculated_duration,
        created_at,
        seconds_since_prev
      FROM potential_duplicates
      WHERE calculated_duration IS NOT NULL
        AND calculated_duration < seconds_since_prev * 2  -- Duration should be less than 2x the time gap
      ORDER BY user_fid, feed_type, created_at
    `);

    const duplicateRows = (duplicateSessions as any).rows || [];
    console.log(`Found ${duplicateRows.length} sessions that appear to be duplicates with cumulative durations\n`);

    if (duplicateRows.length === 0) {
      console.log("No duplicates found. Exiting.");
      return;
    }

    // Group by user/feed to identify session groups
    const sessionGroups = new Map<string, Array<{
      id: string;
      currentDuration: number;
      calculatedDuration: number;
      createdAt: Date;
      secondsSincePrev: number;
    }>>();

    duplicateRows.forEach((row: any) => {
      const key = `${row.user_fid}_${row.feed_type}`;
      if (!sessionGroups.has(key)) {
        sessionGroups.set(key, []);
      }
      const createdAt = row.created_at instanceof Date 
        ? row.created_at 
        : new Date(row.created_at);
      sessionGroups.get(key)!.push({
        id: row.id,
        currentDuration: row.current_duration,
        calculatedDuration: row.calculated_duration,
        createdAt: createdAt,
        secondsSincePrev: row.seconds_since_prev,
      });
    });

    // Step 2: For each session group, identify which records to keep/delete
    // Keep the last record in each sequence, update its duration to the actual total
    // Delete all intermediate records
    console.log(`Step 2: Processing ${sessionGroups.size} session groups...`);
    
    const recordsToDelete: string[] = [];
    const recordsToUpdate: Array<{ id: string; newDuration: number }> = [];
    
    for (const [key, sessions] of sessionGroups.entries()) {
      // Sort by created_at
      sessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      // Group consecutive sessions (within 60 seconds of each other)
      const sequences: Array<typeof sessions> = [];
      let currentSequence: typeof sessions = [sessions[0]];
      
      for (let i = 1; i < sessions.length; i++) {
        const timeDiff = (sessions[i].createdAt.getTime() - sessions[i-1].createdAt.getTime()) / 1000;
        if (timeDiff <= 60) {
          currentSequence.push(sessions[i]);
        } else {
          sequences.push(currentSequence);
          currentSequence = [sessions[i]];
        }
      }
      if (currentSequence.length > 0) {
        sequences.push(currentSequence);
      }
      
      // For each sequence, keep the one with longest duration (should be the final cumulative one), delete the rest
      for (const sequence of sequences) {
        if (sequence.length === 1) continue; // No duplicates
        
        // Sort by duration descending to find the longest (final cumulative duration)
        sequence.sort((a, b) => b.currentDuration - a.currentDuration);
        const keepRecord = sequence[0]; // The one with longest duration
        
        // Delete all others
        for (let i = 1; i < sequence.length; i++) {
          recordsToDelete.push(sequence[i].id);
        }
      }
    }

    console.log(`\nSummary:`);
    console.log(`  Records to delete: ${recordsToDelete.length}\n`);

    if (dryRun) {
      console.log("🔍 DRY RUN - Would delete the above records");
      return;
    }

    // Step 3: Delete duplicate records
    console.log("Step 4: Deleting duplicate records...");
    const batchSize = 500;
    let deletedCount = 0;
    
    for (let i = 0; i < recordsToDelete.length; i += batchSize) {
      const batch = recordsToDelete.slice(i, i + batchSize);
      await db.execute(sql`
        DELETE FROM feed_view_sessions
        WHERE id IN (${sql.raw(batch.map((id: string) => `'${id}'::uuid`).join(', '))})
      `);
      deletedCount += batch.length;
      console.log(`  Deleted ${deletedCount} of ${recordsToDelete.length}...`);
    }
    console.log(`✓ Deleted ${deletedCount} records\n`);

    console.log("✓ Fix completed successfully!");
    console.log("\nNext steps:");
    console.log("  1. Verify the statistics look correct");
    console.log("  2. Run the recalculate-daily-aggregates script");

  } catch (error) {
    console.error("Error fixing feed session durations:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

fixFeedSessionDurations();

