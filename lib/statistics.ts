import { db } from "./db";
import { sql } from "drizzle-orm";
import {
  curatedCasts,
  castReplies,
  curatedCastInteractions,
  curatorCastCurations,
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

export interface WeeklyContributor {
  curatorFid: number;
  curationCount: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

export interface WeeklyContributorsStats {
  topContributors: WeeklyContributor[];
  allContributors: WeeklyContributor[];
}

/**
 * Get weekly contributors statistics (past 7 days)
 */
export async function getWeeklyContributorsStats(): Promise<WeeklyContributorsStats> {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Query curatorCastCurations for past 7 days, grouped by curator
  const contributors = await db
    .select({
      curatorFid: curatorCastCurations.curatorFid,
      curationCount: sql<number>`count(*)::int`,
    })
    .from(curatorCastCurations)
    .where(sql`created_at >= ${weekStart.toISOString()}`)
    .groupBy(curatorCastCurations.curatorFid);

  if (contributors.length === 0) {
    return { topContributors: [], allContributors: [] };
  }

  // Separate into top contributors (>7) and all others
  const topContributors: WeeklyContributor[] = [];
  const allContributors: WeeklyContributor[] = [];

  for (const contributor of contributors) {
    const curatorInfo: WeeklyContributor = {
      curatorFid: contributor.curatorFid,
      curationCount: contributor.curationCount,
    };

    if (contributor.curationCount > 7) {
      topContributors.push(curatorInfo);
    } else {
      allContributors.push(curatorInfo);
    }
  }

  return { topContributors, allContributors };
}


