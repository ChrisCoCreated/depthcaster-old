import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq, notInArray } from "drizzle-orm";
import {
  users,
  userRoles,
  curatedCasts,
  curatorCastCurations,
  curatorPacks,
  userPackSubscriptions,
  packFavorites,
  castReplies,
  curatedCastInteractions,
  userWatches,
  userNotifications,
  pushSubscriptions,
  buildIdeas,
  pageViews,
  feedViewSessions,
  castViews,
  feedViewSessionsDaily,
  castViewsDaily,
  pageViewsDaily,
  apiCallStats,
} from "@/lib/schema";
import { isAdmin, getUserRoles, getAllAdminFids } from "@/lib/roles";

function getTimeRangeFilter(period: string) {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "24h":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      return null; // All time
  }

  return startDate;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fid = searchParams.get("fid");
    const period = searchParams.get("period") || "all-time"; // 24h, 7d, 30d, all-time

    if (!fid) {
      return NextResponse.json({ error: "fid is required" }, { status: 400 });
    }

    const userFid = parseInt(fid);
    if (isNaN(userFid)) {
      return NextResponse.json({ error: "Invalid fid" }, { status: 400 });
    }

    // Check admin access
    const roles = await getUserRoles(userFid);
    if (!isAdmin(roles)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const timeFilter = getTimeRangeFilter(period);
    const timeFilterSql = timeFilter
      ? sql`AND created_at >= ${timeFilter.toISOString()}`
      : sql``;

    // Get admin FIDs to exclude from statistics
    const adminFids = await getAllAdminFids();
    const excludeAdminsFilter = adminFids.length > 0
      ? sql`AND user_fid NOT IN (${sql.join(adminFids.map(fid => sql`${fid}`), sql`, `)})`
      : sql``;

    // Date filter to exclude data before the fix (default: today to exclude all historical inflated data)
    const excludeHistoricalParam = searchParams.get("excludeHistorical");
    const excludeHistorical = excludeHistoricalParam === "true" || excludeHistoricalParam === null; // Default to true
    const sinceFixDate = excludeHistorical ? new Date() : null; // Default to today
    const sinceFixFilter = sinceFixDate ? sql`AND created_at >= ${sinceFixDate.toISOString()}` : sql``;
    const sinceFixDateFilter = sinceFixDate ? sql`AND date >= ${sinceFixDate.toISOString()}` : sql``;

    // Calculate effective date filter: use the maximum (most recent) of timeFilter and sinceFixDate
    // This ensures we don't create impossible conditions like ">= 24h_ago AND >= today"
    const effectiveDateFilter = timeFilter && sinceFixDate
      ? (timeFilter > sinceFixDate ? timeFilter : sinceFixDate)
      : (timeFilter || sinceFixDate);

    // User Statistics (only authenticated users - users table only contains logged-in users)
    const totalUsers = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    
    const newUsers = timeFilter
      ? await db
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(sql`created_at >= ${timeFilter.toISOString()}`)
      : [{ count: 0 }];

    const usersWithRoles = await db
      .select({ count: sql<number>`count(distinct user_fid)::int` })
      .from(userRoles);

    // Anonymous vs Authenticated analytics - exclude admins and historical data
    let pageViewsWhere = sql`user_fid IS NOT NULL`;
    if (timeFilter) {
      pageViewsWhere = sql`${pageViewsWhere} AND created_at >= ${timeFilter.toISOString()}`;
    }
    if (sinceFixDate) {
      pageViewsWhere = sql`${pageViewsWhere} AND created_at >= ${sinceFixDate.toISOString()}`;
    }
    if (excludeAdminsFilter) {
      pageViewsWhere = sql`${pageViewsWhere} ${excludeAdminsFilter}`;
    }
    
    const authenticatedPageViews = await db.select({ count: sql<number>`count(*)::int` }).from(pageViews).where(pageViewsWhere);

    let anonymousPageViewsWhere = sql`user_fid IS NULL`;
    if (timeFilter) {
      anonymousPageViewsWhere = sql`${anonymousPageViewsWhere} AND created_at >= ${timeFilter.toISOString()}`;
    }
    if (sinceFixDate) {
      anonymousPageViewsWhere = sql`${anonymousPageViewsWhere} AND created_at >= ${sinceFixDate.toISOString()}`;
    }
    const anonymousPageViews = await db.select({ count: sql<number>`count(*)::int` }).from(pageViews).where(anonymousPageViewsWhere);

    let authenticatedFeedSessionsWhere = sql`user_fid IS NOT NULL`;
    if (timeFilter) {
      authenticatedFeedSessionsWhere = sql`${authenticatedFeedSessionsWhere} AND created_at >= ${timeFilter.toISOString()}`;
    }
    if (sinceFixDate) {
      authenticatedFeedSessionsWhere = sql`${authenticatedFeedSessionsWhere} AND created_at >= ${sinceFixDate.toISOString()}`;
    }
    if (excludeAdminsFilter) {
      authenticatedFeedSessionsWhere = sql`${authenticatedFeedSessionsWhere} ${excludeAdminsFilter}`;
    }
    const authenticatedFeedSessions = await db.select({ count: sql<number>`count(*)::int` }).from(feedViewSessions).where(authenticatedFeedSessionsWhere);

    let anonymousFeedSessionsWhere = sql`user_fid IS NULL`;
    if (timeFilter) {
      anonymousFeedSessionsWhere = sql`${anonymousFeedSessionsWhere} AND created_at >= ${timeFilter.toISOString()}`;
    }
    if (sinceFixDate) {
      anonymousFeedSessionsWhere = sql`${anonymousFeedSessionsWhere} AND created_at >= ${sinceFixDate.toISOString()}`;
    }
    const anonymousFeedSessions = await db.select({ count: sql<number>`count(*)::int` }).from(feedViewSessions).where(anonymousFeedSessionsWhere);

    let authenticatedCastViewsWhere = sql`user_fid IS NOT NULL`;
    if (timeFilter) {
      authenticatedCastViewsWhere = sql`${authenticatedCastViewsWhere} AND created_at >= ${timeFilter.toISOString()}`;
    }
    if (sinceFixDate) {
      authenticatedCastViewsWhere = sql`${authenticatedCastViewsWhere} AND created_at >= ${sinceFixDate.toISOString()}`;
    }
    if (excludeAdminsFilter) {
      authenticatedCastViewsWhere = sql`${authenticatedCastViewsWhere} ${excludeAdminsFilter}`;
    }
    const authenticatedCastViews = await db.select({ count: sql<number>`count(*)::int` }).from(castViews).where(authenticatedCastViewsWhere);

    let anonymousCastViewsWhere = sql`user_fid IS NULL`;
    if (timeFilter) {
      anonymousCastViewsWhere = sql`${anonymousCastViewsWhere} AND created_at >= ${timeFilter.toISOString()}`;
    }
    if (sinceFixDate) {
      anonymousCastViewsWhere = sql`${anonymousCastViewsWhere} AND created_at >= ${sinceFixDate.toISOString()}`;
    }
    const anonymousCastViews = await db.select({ count: sql<number>`count(*)::int` }).from(castViews).where(anonymousCastViewsWhere);

    // Unique authenticated users in analytics - exclude admins
    const uniqueAuthenticatedUsers = await db.select({ count: sql<number>`count(distinct user_fid)::int` }).from(pageViews).where(pageViewsWhere);

    // Content Statistics
    const totalCuratedCasts = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(curatedCasts);

    const newCuratedCasts = timeFilter
      ? await db
          .select({ count: sql<number>`count(*)::int` })
          .from(curatedCasts)
          .where(sql`created_at >= ${timeFilter.toISOString()}`)
      : [{ count: 0 }];

    const totalCuratorPacks = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(curatorPacks);

    const totalPackSubscriptions = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userPackSubscriptions);

    const totalPackFavorites = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(packFavorites);

    const totalCastReplies = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(castReplies);

    const newCastReplies = timeFilter
      ? await db
          .select({ count: sql<number>`count(*)::int` })
          .from(castReplies)
          .where(sql`created_at >= ${timeFilter.toISOString()}`)
      : [{ count: 0 }];

    // Average quality score for newly curated casts
    const avgQualityScore = timeFilter
      ? await db
          .select({
            avg: sql<number>`avg(quality_score)::int`,
            count: sql<number>`count(*)::int`,
          })
          .from(curatedCasts)
          .where(sql`created_at >= ${timeFilter.toISOString()} AND quality_score IS NOT NULL`)
      : [{ avg: null, count: 0 }];

    // Cast Interactions
    const interactions = await db
      .select({
        type: curatedCastInteractions.interactionType,
        count: sql<number>`count(*)::int`,
      })
      .from(curatedCastInteractions)
      .where(timeFilter ? sql`created_at >= ${timeFilter.toISOString()}` : sql`1=1`)
      .groupBy(curatedCastInteractions.interactionType);

    const interactionMap = new Map<string, number>();
    interactions.forEach((i) => interactionMap.set(i.type, i.count));

    // User Actions
    const totalWatches = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userWatches);

    const newWatches = timeFilter
      ? await db
          .select({ count: sql<number>`count(*)::int` })
          .from(userWatches)
          .where(sql`created_at >= ${timeFilter.toISOString()}`)
      : [{ count: 0 }];

    const totalNotifications = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userNotifications);

    const unreadNotifications = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userNotifications)
      .where(sql`is_read = false`);

    const totalPushSubscriptions = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pushSubscriptions);

    const totalBuildIdeas = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(buildIdeas);

    // Popular Pages (from page_views)
    const popularPages = await db
      .select({
        pagePath: pageViews.pagePath,
        count: sql<number>`count(*)::int`,
      })
      .from(pageViews)
      .where(timeFilter ? sql`created_at >= ${timeFilter.toISOString()}` : sql`1=1`)
      .groupBy(pageViews.pagePath)
      .orderBy(sql`count(*) DESC`)
      .limit(20);

    // Feed Analytics - UNION data from both main table and daily aggregates
    // Exclude admin users and optionally exclude historical data before fix
    let feedViewStatsRecentWhere = sql`1=1`;
    if (effectiveDateFilter) {
      feedViewStatsRecentWhere = sql`created_at >= ${effectiveDateFilter.toISOString()}`;
    }
    if (excludeAdminsFilter) {
      feedViewStatsRecentWhere = sql`${feedViewStatsRecentWhere} ${excludeAdminsFilter}`;
    }
    
    const feedViewStatsRecent = await db
      .select({
        feedType: feedViewSessions.feedType,
        totalSessions: sql<number>`count(*)::int`,
        totalDuration: sql<number>`COALESCE(sum(duration_seconds), 0)::bigint`,
        avgDuration: sql<number | null>`ROUND(COALESCE(avg(duration_seconds), 0))::bigint`,
        uniqueUsers: sql<number>`count(distinct user_fid)::int`,
      })
      .from(feedViewSessions)
      .where(feedViewStatsRecentWhere)
      .groupBy(feedViewSessions.feedType);

    // Daily aggregates - exclude historical data if requested
    // Note: Daily aggregates don't have user_fid, so we can't exclude admins from them
    // But we can exclude historical dates
    const feedViewStatsDailyWhere = effectiveDateFilter
      ? sql`date >= ${effectiveDateFilter.toISOString()}`
      : sql`1=1`;
    
    const feedViewStatsDaily = await db
      .select({
        feedType: feedViewSessionsDaily.feedType,
        totalSessions: sql<number>`COALESCE(sum(total_sessions), 0)::int`,
        totalDuration: sql<number>`COALESCE(sum(total_duration_seconds), 0)::bigint`,
        avgDuration: sql<number | null>`ROUND(COALESCE(avg(avg_duration), 0))::bigint`,
        uniqueUsers: sql<number>`COALESCE(max(unique_users), 0)::int`,
      })
      .from(feedViewSessionsDaily)
      .where(feedViewStatsDailyWhere)
      .groupBy(feedViewSessionsDaily.feedType);

    // Merge results by feed type
    const feedViewStatsMap = new Map<string, {
      feedType: string;
      totalSessions: number;
      totalDuration: number;
      avgDuration: number;
      uniqueUsers: number;
    }>();

    // Add recent data
    feedViewStatsRecent.forEach((r) => {
      feedViewStatsMap.set(r.feedType, {
        feedType: r.feedType,
        totalSessions: r.totalSessions,
        totalDuration: typeof r.totalDuration === 'string' ? parseInt(r.totalDuration) : r.totalDuration,
        avgDuration: r.avgDuration ? (typeof r.avgDuration === 'string' ? parseInt(r.avgDuration) : r.avgDuration) : 0,
        uniqueUsers: r.uniqueUsers,
      });
    });

    // Add/merge daily data
    feedViewStatsDaily.forEach((d) => {
      const existing = feedViewStatsMap.get(d.feedType);
      if (existing) {
        existing.totalSessions += d.totalSessions;
        existing.totalDuration += typeof d.totalDuration === 'string' ? parseInt(d.totalDuration) : d.totalDuration;
        existing.uniqueUsers = Math.max(existing.uniqueUsers, d.uniqueUsers); // Use max since daily is aggregated
        // Recalculate average
        existing.avgDuration = existing.totalSessions > 0 
          ? Math.round(existing.totalDuration / existing.totalSessions)
          : 0;
      } else {
        feedViewStatsMap.set(d.feedType, {
          feedType: d.feedType,
          totalSessions: d.totalSessions,
          totalDuration: typeof d.totalDuration === 'string' ? parseInt(d.totalDuration) : d.totalDuration,
          avgDuration: d.avgDuration ? (typeof d.avgDuration === 'string' ? parseInt(d.avgDuration) : d.avgDuration) : 0,
          uniqueUsers: d.uniqueUsers,
        });
      }
    });

    const feedViewStats = Array.from(feedViewStatsMap.values());

    // Cast Views - UNION data from both main table and daily aggregates
    // Exclude admin users and optionally exclude historical data
    let castViewStatsRecentWhere = sql`1=1`;
    if (effectiveDateFilter) {
      castViewStatsRecentWhere = sql`created_at >= ${effectiveDateFilter.toISOString()}`;
    }
    if (excludeAdminsFilter) {
      castViewStatsRecentWhere = sql`${castViewStatsRecentWhere} ${excludeAdminsFilter}`;
    }
    
    const castViewStatsRecent = await db
      .select({
        feedType: sql<string>`COALESCE(${castViews.feedType}, 'unknown')`,
        totalViews: sql<number>`count(*)::int`,
        uniqueCasts: sql<number>`count(distinct cast_hash)::int`,
        uniqueUsers: sql<number>`count(distinct user_fid)::int`,
      })
      .from(castViews)
      .where(castViewStatsRecentWhere)
      .groupBy(sql`COALESCE(${castViews.feedType}, 'unknown')`);

    // Daily cast views - exclude historical data if requested
    const castViewStatsDailyWhere = effectiveDateFilter
      ? sql`date >= ${effectiveDateFilter.toISOString()}`
      : sql`1=1`;
    
    const castViewStatsDaily = await db
      .select({
        feedType: castViewsDaily.feedType,
        totalViews: sql<number>`COALESCE(sum(view_count), 0)::int`,
        uniqueCasts: sql<number>`count(distinct cast_hash)::int`,
        uniqueUsers: sql<number>`COALESCE(max(unique_users), 0)::int`,
      })
      .from(castViewsDaily)
      .where(castViewStatsDailyWhere)
      .groupBy(castViewsDaily.feedType);

    // Merge results by feed type
    const castViewStatsMap = new Map<string, {
      feedType: string;
      totalViews: number;
      uniqueCasts: number;
      uniqueUsers: number;
    }>();

    // Add recent data
    castViewStatsRecent.forEach((r) => {
      castViewStatsMap.set(r.feedType, {
        feedType: r.feedType,
        totalViews: r.totalViews,
        uniqueCasts: r.uniqueCasts,
        uniqueUsers: r.uniqueUsers,
      });
    });

    // Add/merge daily data - for unique casts, we use the sum since daily table has distinct cast_hash per row
    castViewStatsDaily.forEach((d) => {
      const existing = castViewStatsMap.get(d.feedType);
      if (existing) {
        existing.totalViews += d.totalViews;
        existing.uniqueCasts += d.uniqueCasts; // Daily table has one row per cast_hash, so count is accurate
        existing.uniqueUsers = Math.max(existing.uniqueUsers, d.uniqueUsers);
      } else {
        castViewStatsMap.set(d.feedType, {
          feedType: d.feedType,
          totalViews: d.totalViews,
          uniqueCasts: d.uniqueCasts,
          uniqueUsers: d.uniqueUsers,
        });
      }
    });

    const castViewStats = Array.from(castViewStatsMap.values());

    // Top Curators
    const topCurators = await db
      .select({
        curatorFid: curatorCastCurations.curatorFid,
        count: sql<number>`count(*)::int`,
      })
      .from(curatorCastCurations)
      .where(timeFilter ? sql`created_at >= ${timeFilter.toISOString()}` : sql`1=1`)
      .groupBy(curatorCastCurations.curatorFid)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    // Most Engaged Casts
    const mostEngagedCasts = await db
      .select({
        castHash: curatedCasts.castHash,
        engagementScore: curatedCasts.engagementScore,
        likesCount: curatedCasts.likesCount,
        recastsCount: curatedCasts.recastsCount,
        repliesCount: curatedCasts.repliesCount,
      })
      .from(curatedCasts)
      .orderBy(sql`engagement_score DESC`)
      .limit(10);

    // Engagement Metrics
    const avgEngagementScore = await db
      .select({
        avg: sql<number>`avg(engagement_score)::int`,
      })
      .from(curatedCasts)
      .where(sql`engagement_score > 0`);

    // Database Monitoring
    const tableSizes = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
        pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes,
        (SELECT count(*) FROM information_schema.columns WHERE table_schema = schemaname AND table_name = tablename) AS column_count
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);

    const rowCounts = await db.execute(sql`
      SELECT 
        'users' as table_name, count(*)::bigint as row_count FROM users
      UNION ALL
      SELECT 'curated_casts', count(*)::bigint FROM curated_casts
      UNION ALL
      SELECT 'cast_views', count(*)::bigint FROM cast_views
      UNION ALL
      SELECT 'feed_view_sessions', count(*)::bigint FROM feed_view_sessions
      UNION ALL
      SELECT 'page_views', count(*)::bigint FROM page_views
      UNION ALL
      SELECT 'curator_packs', count(*)::bigint FROM curator_packs
      UNION ALL
      SELECT 'user_notifications', count(*)::bigint FROM user_notifications
      UNION ALL
      SELECT 'curated_cast_interactions', count(*)::bigint FROM curated_cast_interactions
      ORDER BY row_count DESC
    `);

    // Data retention status
    const oldestRecords = await db.execute(sql`
      SELECT 
        'page_views' as table_name, min(created_at) as oldest_record FROM page_views
      UNION ALL
      SELECT 'feed_view_sessions', min(created_at) FROM feed_view_sessions
      UNION ALL
      SELECT 'cast_views', min(created_at) FROM cast_views
    `);

    // Daily Usage Breakdowns - exclude admins and historical data
    let dailyBreakdownRecentWhere = sql`1=1`;
    if (effectiveDateFilter) {
      dailyBreakdownRecentWhere = sql`created_at >= ${effectiveDateFilter.toISOString()}`;
    }
    if (excludeAdminsFilter) {
      dailyBreakdownRecentWhere = sql`${dailyBreakdownRecentWhere} ${excludeAdminsFilter}`;
    }
    
    let dailyBreakdownDailyWhere = sql`1=1`;
    if (effectiveDateFilter) {
      dailyBreakdownDailyWhere = sql`date >= ${effectiveDateFilter.toISOString()}`;
    }
    
    const dailyBreakdownQuery = sql`
      SELECT 
        date,
        feed_type,
        SUM(total_sessions)::int as total_sessions,
        SUM(total_duration_seconds)::bigint as total_duration_seconds,
        CASE 
          WHEN SUM(total_sessions) > 0 
          THEN ROUND(SUM(total_duration_seconds)::float / SUM(total_sessions)::float)::bigint
          ELSE 0::bigint
        END as avg_duration_seconds,
        COUNT(DISTINCT user_fid)::int as unique_users
      FROM (
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          feed_type,
          1 as total_sessions,
          duration_seconds as total_duration_seconds,
          user_fid
        FROM feed_view_sessions
        WHERE ${dailyBreakdownRecentWhere}
        UNION ALL
        SELECT 
          date,
          feed_type,
          total_sessions,
          total_duration_seconds,
          NULL as user_fid
        FROM feed_view_sessions_daily
        WHERE ${dailyBreakdownDailyWhere}
      ) combined
      GROUP BY date, feed_type
      ORDER BY date DESC, feed_type
    `;
    
    const dailyBreakdownRaw = await db.execute(dailyBreakdownQuery);
    const dailyBreakdown = (dailyBreakdownRaw as any).rows?.map((r: any) => ({
      date: r.date,
      feedType: r.feed_type,
      totalSessions: parseInt(r.total_sessions) || 0,
      totalDurationSeconds: typeof r.total_duration_seconds === 'string' ? parseInt(r.total_duration_seconds) : (r.total_duration_seconds || 0),
      avgDurationSeconds: typeof r.avg_duration_seconds === 'string' ? parseInt(r.avg_duration_seconds) : (r.avg_duration_seconds || 0),
      uniqueUsers: parseInt(r.unique_users) || 0,
    })) || [];

    // Daily Cast Views Breakdown - exclude admins and historical data
    let dailyCastViewsRecentWhere = sql`1=1`;
    if (effectiveDateFilter) {
      dailyCastViewsRecentWhere = sql`created_at >= ${effectiveDateFilter.toISOString()}`;
    }
    if (excludeAdminsFilter) {
      dailyCastViewsRecentWhere = sql`${dailyCastViewsRecentWhere} ${excludeAdminsFilter}`;
    }
    
    let dailyCastViewsDailyWhere = sql`1=1`;
    if (effectiveDateFilter) {
      dailyCastViewsDailyWhere = sql`date >= ${effectiveDateFilter.toISOString()}`;
    }
    
    const dailyCastViewsQuery = sql`
      SELECT 
        date,
        feed_type,
        SUM(view_count)::int as total_views,
        COUNT(DISTINCT cast_hash)::int as unique_casts,
        COUNT(DISTINCT user_fid)::int as unique_users
      FROM (
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COALESCE(feed_type, 'unknown') as feed_type,
          1 as view_count,
          cast_hash,
          user_fid
        FROM cast_views
        WHERE ${dailyCastViewsRecentWhere}
        UNION ALL
        SELECT 
          date,
          feed_type,
          view_count,
          cast_hash,
          NULL as user_fid
        FROM cast_views_daily
        WHERE ${dailyCastViewsDailyWhere}
      ) combined
      GROUP BY date, feed_type
      ORDER BY date DESC, feed_type
    `;
    
    const dailyCastViewsRaw = await db.execute(dailyCastViewsQuery);
    const dailyCastViews = (dailyCastViewsRaw as any).rows?.map((r: any) => ({
      date: r.date,
      feedType: r.feed_type || 'unknown',
      totalViews: parseInt(r.total_views) || 0,
      uniqueCasts: parseInt(r.unique_casts) || 0,
      uniqueUsers: parseInt(r.unique_users) || 0,
    })) || [];

    // Active Users for Past 7 Days
    const activeUsersQuery = sql`
      WITH date_range AS (
        SELECT generate_series(
          DATE_TRUNC('day', NOW() - INTERVAL '6 days'),
          DATE_TRUNC('day', NOW()),
          '1 day'::interval
        )::date as date
      ),
      daily_active_users AS (
        SELECT DISTINCT
          DATE_TRUNC('day', created_at)::date as date,
          user_fid
        FROM feed_view_sessions
        WHERE user_fid IS NOT NULL
          AND user_fid NOT IN (${sql.join(adminFids.map(fid => sql`${fid}`), sql`, `)})
          AND created_at >= DATE_TRUNC('day', NOW() - INTERVAL '6 days')
        UNION
        SELECT DISTINCT
          DATE_TRUNC('day', created_at)::date as date,
          user_fid
        FROM cast_views
        WHERE user_fid IS NOT NULL
          AND user_fid NOT IN (${sql.join(adminFids.map(fid => sql`${fid}`), sql`, `)})
          AND created_at >= DATE_TRUNC('day', NOW() - INTERVAL '6 days')
        UNION
        SELECT DISTINCT
          DATE_TRUNC('day', created_at)::date as date,
          user_fid
        FROM page_views
        WHERE user_fid IS NOT NULL
          AND user_fid NOT IN (${sql.join(adminFids.map(fid => sql`${fid}`), sql`, `)})
          AND created_at >= DATE_TRUNC('day', NOW() - INTERVAL '6 days')
      ),
      daily_curators AS (
        SELECT DISTINCT
          DATE_TRUNC('day', created_at)::date as date,
          curator_fid as user_fid
        FROM curated_casts
        WHERE curator_fid IS NOT NULL
          AND curator_fid NOT IN (${sql.join(adminFids.map(fid => sql`${fid}`), sql`, `)})
          AND created_at >= DATE_TRUNC('day', NOW() - INTERVAL '6 days')
      ),
      daily_onchain_actions AS (
        SELECT DISTINCT
          DATE_TRUNC('day', created_at)::date as date,
          user_fid
        FROM curated_cast_interactions
        WHERE user_fid NOT IN (${sql.join(adminFids.map(fid => sql`${fid}`), sql`, `)})
          AND created_at >= DATE_TRUNC('day', NOW() - INTERVAL '6 days')
        UNION
        SELECT DISTINCT
          DATE_TRUNC('day', created_at)::date as date,
          watcher_fid as user_fid
        FROM user_watches
        WHERE watcher_fid NOT IN (${sql.join(adminFids.map(fid => sql`${fid}`), sql`, `)})
          AND created_at >= DATE_TRUNC('day', NOW() - INTERVAL '6 days')
      ),
      daily_users_with_flags AS (
        SELECT 
          dau.date,
          dau.user_fid,
          CASE WHEN dc.user_fid IS NOT NULL THEN true ELSE false END as curated,
          CASE WHEN doa.user_fid IS NOT NULL THEN true ELSE false END as onchain
        FROM daily_active_users dau
        LEFT JOIN daily_curators dc ON dau.date = dc.date AND dau.user_fid = dc.user_fid
        LEFT JOIN daily_onchain_actions doa ON dau.date = doa.date AND dau.user_fid = doa.user_fid
      )
      SELECT 
        dr.date,
        COALESCE(
          json_agg(
            json_build_object(
              'fid', duwf.user_fid,
              'curated', duwf.curated,
              'onchain', duwf.onchain
            ) ORDER BY duwf.user_fid
          ) FILTER (WHERE duwf.user_fid IS NOT NULL),
          '[]'::json
        ) as users
      FROM date_range dr
      LEFT JOIN daily_users_with_flags duwf ON dr.date = duwf.date
      GROUP BY dr.date
      ORDER BY dr.date DESC
    `;

    const activeUsersResult = await db.execute(activeUsersQuery);
    const activeUsersData = (activeUsersResult as any).rows?.map((row: any) => ({
      date: row.date,
      users: (row.users || []).map((user: any) => ({
        fid: parseInt(user.fid),
        curated: user.curated || false,
        onchain: user.onchain || false,
      })),
    })) || [];

    // API Call Statistics
    let reactionFetchCount = 0;
    let reactionFetchCUCost = 0;
    try {
      const reactionFetchStats = await db
        .select()
        .from(apiCallStats)
        .where(eq(apiCallStats.callType, "reaction_fetch"))
        .limit(1);
      reactionFetchCount = reactionFetchStats[0]?.count || 0;
      reactionFetchCUCost = reactionFetchCount * 2; // 2 CU per fetch
    } catch (error) {
      // Table might not exist yet, use default values
      console.warn("api_call_stats table not available:", error);
    }

    return NextResponse.json({
      period,
      users: {
        total: totalUsers[0]?.count || 0, // All authenticated users (users table only contains logged-in users)
        new: newUsers[0]?.count || 0,
        withRoles: usersWithRoles[0]?.count || 0,
        uniqueActiveUsers: uniqueAuthenticatedUsers[0]?.count || 0, // Unique authenticated users with analytics activity
      },
      analytics: {
        pageViews: {
          authenticated: authenticatedPageViews[0]?.count || 0,
          anonymous: anonymousPageViews[0]?.count || 0,
          total: (authenticatedPageViews[0]?.count || 0) + (anonymousPageViews[0]?.count || 0),
        },
        feedSessions: {
          authenticated: authenticatedFeedSessions[0]?.count || 0,
          anonymous: anonymousFeedSessions[0]?.count || 0,
          total: (authenticatedFeedSessions[0]?.count || 0) + (anonymousFeedSessions[0]?.count || 0),
        },
        castViews: {
          authenticated: authenticatedCastViews[0]?.count || 0,
          anonymous: anonymousCastViews[0]?.count || 0,
          total: (authenticatedCastViews[0]?.count || 0) + (anonymousCastViews[0]?.count || 0),
        },
      },
      content: {
        curatedCasts: {
          total: totalCuratedCasts[0]?.count || 0,
          new: newCuratedCasts[0]?.count || 0,
          avgQualityScore: avgQualityScore[0]?.avg || null,
        },
        curatorPacks: totalCuratorPacks[0]?.count || 0,
        packSubscriptions: totalPackSubscriptions[0]?.count || 0,
        packFavorites: totalPackFavorites[0]?.count || 0,
        castReplies: {
          total: totalCastReplies[0]?.count || 0,
          new: newCastReplies[0]?.count || 0,
        },
      },
      interactions: {
        likes: interactionMap.get("like") || 0,
        recasts: interactionMap.get("recast") || 0,
        replies: interactionMap.get("reply") || 0,
        quotes: interactionMap.get("quote") || 0,
        total: Array.from(interactionMap.values()).reduce((a, b) => a + b, 0),
      },
      userActions: {
        watches: {
          total: totalWatches[0]?.count || 0,
          new: newWatches[0]?.count || 0,
        },
        notifications: {
          total: totalNotifications[0]?.count || 0,
          unread: unreadNotifications[0]?.count || 0,
          readRate: totalNotifications[0]?.count > 0
            ? ((totalNotifications[0].count - (unreadNotifications[0]?.count || 0)) / totalNotifications[0].count * 100).toFixed(1)
            : "0.0",
        },
        pushSubscriptions: totalPushSubscriptions[0]?.count || 0,
        buildIdeas: totalBuildIdeas[0]?.count || 0,
      },
      popularPages: popularPages.map((p) => ({
        path: p.pagePath,
        views: p.count,
      })),
      feedAnalytics: {
        viewSessions: feedViewStats.map((f) => ({
          feedType: f.feedType,
          totalSessions: f.totalSessions,
          totalDurationSeconds: f.totalDuration,
          avgDurationSeconds: f.avgDuration || 0,
          uniqueUsers: f.uniqueUsers,
        })),
        castViews: castViewStats.map((c) => ({
          feedType: c.feedType || "unknown",
          totalViews: c.totalViews,
          uniqueCasts: c.uniqueCasts,
          uniqueUsers: c.uniqueUsers,
        })),
        dailyBreakdown: dailyBreakdown,
        dailyCastViews: dailyCastViews,
      },
      engagement: {
        avgScore: avgEngagementScore[0]?.avg || 0,
        topCurators: topCurators.map((c) => ({
          curatorFid: c.curatorFid,
          curationCount: c.count,
        })),
        mostEngagedCasts: mostEngagedCasts.map((c) => ({
          castHash: c.castHash,
          engagementScore: c.engagementScore,
          likesCount: c.likesCount,
          recastsCount: c.recastsCount,
          repliesCount: c.repliesCount,
        })),
      },
      monitoring: {
        tableSizes: Array.isArray(tableSizes) ? tableSizes : (tableSizes as any).rows || [],
        rowCounts: Array.isArray(rowCounts) ? rowCounts : (rowCounts as any).rows || [],
        oldestRecords: Array.isArray(oldestRecords) ? oldestRecords : (oldestRecords as any).rows || [],
      },
      apiCalls: {
        reactionFetches: {
          count: reactionFetchCount,
          cuCost: reactionFetchCUCost,
          cuCostPerCall: 2,
        },
      },
      activeUsers: activeUsersData,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; cause?: any };
    const errorMessage = err.message || String(err);
    const errorDetails = err.cause ? ` Cause: ${err.cause}` : '';
    console.error("Statistics API error:", errorMessage, errorDetails, error);
    return NextResponse.json(
      { error: `Failed query: ${errorMessage}${errorDetails}` },
      { status: 500 }
    );
  }
}

