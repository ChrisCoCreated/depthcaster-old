import { db } from "./db";
import { sql } from "drizzle-orm";
import {
  curatedCasts,
  castReplies,
  curatedCastInteractions,
} from "./schema";

export interface DailyStats {
  castsCurated: number;
  avgQualityScore: number | null;
  replies: number;
  likes: number;
  recasts: number;
}

/**
 * Get statistics for the past 24 hours
 */
export async function get24HourStats(): Promise<DailyStats> {
  const now = new Date();
  const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Number of casts curated
  const newCuratedCasts = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(curatedCasts)
    .where(sql`created_at >= ${startDate.toISOString()}`);

  // Average quality score
  const avgQualityScore = await db
    .select({
      avg: sql<number>`avg(quality_score)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(curatedCasts)
    .where(sql`created_at >= ${startDate.toISOString()} AND quality_score IS NOT NULL`);

  // Number of replies
  const newCastReplies = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(castReplies)
    .where(sql`created_at >= ${startDate.toISOString()}`);

  // Interactions (likes, recasts)
  const interactions = await db
    .select({
      type: curatedCastInteractions.interactionType,
      count: sql<number>`count(*)::int`,
    })
    .from(curatedCastInteractions)
    .where(sql`created_at >= ${startDate.toISOString()}`)
    .groupBy(curatedCastInteractions.interactionType);

  const interactionMap = new Map<string, number>();
  interactions.forEach((i) => interactionMap.set(i.type, i.count));

  return {
    castsCurated: newCuratedCasts[0]?.count || 0,
    avgQualityScore: avgQualityScore[0]?.avg || null,
    replies: newCastReplies[0]?.count || 0,
    likes: interactionMap.get("like") || 0,
    recasts: interactionMap.get("recast") || 0,
  };
}
