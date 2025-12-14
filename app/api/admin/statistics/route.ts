import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq } from "drizzle-orm";
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
  miniappInstallations,
  signInLogs,
  activityEvents,
} from "@/lib/schema";
import { isAdmin, getUserRoles, getAllAdminFids, getAllCuratorFids } from "@/lib/roles";
import { get14DayActiveUsers, getSignedInEver, getMiniappOnlyUsers } from "@/lib/canonicalMetrics";

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

    // Canonical User Statistics
    const signedInEver = await getSignedInEver();
    const d14ActiveUsers = await get14DayActiveUsers();
    const miniappOnlyUsers = await getMiniappOnlyUsers();
    
    const newUsers = timeFilter
      ? await db
          .select({ count: sql<number>`count(distinct user_fid)::int` })
          .from(signInLogs)
          .where(sql`success = true AND user_fid IS NOT NULL AND created_at >= ${timeFilter.toISOString()}`)
      : [{ count: 0 }];

    const usersWithRoles = await db
      .select({ count: sql<number>`count(distinct user_fid)::int` })
      .from(userRoles);

    // Anonymous vs Authenticated analytics
    const authenticatedPageViewsQuery = timeFilter
      ? db.select({ count: sql<number>`count(*)::int` }).from(pageViews).where(sql`user_fid IS NOT NULL AND created_at >= ${timeFilter.toISOString()}`)
      : db.select({ count: sql<number>`count(*)::int` }).from(pageViews).where(sql`user_fid IS NOT NULL`);
    const authenticatedPageViews = await authenticatedPageViewsQuery;

    const anonymousPageViewsQuery = timeFilter
      ? db.select({ count: sql<number>`count(*)::int` }).from(pageViews).where(sql`user_fid IS NULL AND created_at >= ${timeFilter.toISOString()}`)
      : db.select({ count: sql<number>`count(*)::int` }).from(pageViews).where(sql`user_fid IS NULL`);
    const anonymousPageViews = await anonymousPageViewsQuery;

    const authenticatedFeedSessionsQuery = timeFilter
      ? db.select({ count: sql<number>`count(*)::int` }).from(feedViewSessions).where(sql`user_fid IS NOT NULL AND created_at >= ${timeFilter.toISOString()}`)
      : db.select({ count: sql<number>`count(*)::int` }).from(feedViewSessions).where(sql`user_fid IS NOT NULL`);
    const authenticatedFeedSessions = await authenticatedFeedSessionsQuery;

    const anonymousFeedSessionsQuery = timeFilter
      ? db.select({ count: sql<number>`count(*)::int` }).from(feedViewSessions).where(sql`user_fid IS NULL AND created_at >= ${timeFilter.toISOString()}`)
      : db.select({ count: sql<number>`count(*)::int` }).from(feedViewSessions).where(sql`user_fid IS NULL`);
    const anonymousFeedSessions = await anonymousFeedSessionsQuery;

    const authenticatedCastViewsQuery = timeFilter
      ? db.select({ count: sql<number>`count(*)::int` }).from(castViews).where(sql`user_fid IS NOT NULL AND created_at >= ${timeFilter.toISOString()}`)
      : db.select({ count: sql<number>`count(*)::int` }).from(castViews).where(sql`user_fid IS NOT NULL`);
    const authenticatedCastViews = await authenticatedCastViewsQuery;

    const anonymousCastViewsQuery = timeFilter
      ? db.select({ count: sql<number>`count(*)::int` }).from(castViews).where(sql`user_fid IS NULL AND created_at >= ${timeFilter.toISOString()}`)
      : db.select({ count: sql<number>`count(*)::int` }).from(castViews).where(sql`user_fid IS NULL`);
    const anonymousCastViews = await anonymousCastViewsQuery;

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

    // Feed Analytics - Merge data from main table and daily aggregates
    // Strategy:
    // - When timeFilter is set: Only query feed_view_sessions (recent data, no need for daily aggregates)
    // - When timeFilter is null (all-time): Merge both feed_view_sessions and feed_view_sessions_daily
    // - For unique users: Use MAX when merging (since daily stores aggregated unique_users)
    const feedViewStatsRecent = await db
      .select({
        feedType: feedViewSessions.feedType,
        totalSessions: sql<number>`count(*)::int`,
        totalDuration: sql<number>`COALESCE(sum(duration_seconds), 0)::bigint`,
        avgDuration: sql<number | null>`ROUND(COALESCE(avg(duration_seconds), 0))::bigint`,
        uniqueUsers: sql<number>`count(distinct user_fid)::int`,
      })
      .from(feedViewSessions)
      .where(timeFilter ? sql`created_at >= ${timeFilter.toISOString()}` : sql`1=1`)
      .groupBy(feedViewSessions.feedType);

    // Only query daily aggregates when timeFilter is null (all-time view)
    // Daily aggregates contain older data (30+ days) that's been aggregated for cost savings
    const feedViewStatsDaily = timeFilter
      ? [] // Skip daily aggregates when time filter is set
      : await db
          .select({
            feedType: feedViewSessionsDaily.feedType,
            totalSessions: sql<number>`COALESCE(sum(total_sessions), 0)::int`,
            totalDuration: sql<number>`COALESCE(sum(total_duration_seconds), 0)::bigint`,
            avgDuration: sql<number | null>`ROUND(COALESCE(avg(avg_duration), 0))::bigint`,
            uniqueUsers: sql<number>`COALESCE(max(unique_users), 0)::int`,
          })
          .from(feedViewSessionsDaily)
          .groupBy(feedViewSessionsDaily.feedType);

    // Merge results by feed type
    const feedViewStatsMap = new Map<string, {
      feedType: string;
      totalSessions: number;
      totalDuration: number;
      avgDuration: number;
      uniqueUsers: number;
    }>();

    // Add recent data from main table
    feedViewStatsRecent.forEach((r) => {
      feedViewStatsMap.set(r.feedType, {
        feedType: r.feedType,
        totalSessions: r.totalSessions,
        totalDuration: typeof r.totalDuration === 'string' ? parseInt(r.totalDuration) : r.totalDuration,
        avgDuration: r.avgDuration ? (typeof r.avgDuration === 'string' ? parseInt(r.avgDuration) : r.avgDuration) : 0,
        uniqueUsers: r.uniqueUsers,
      });
    });

    // Add/merge daily aggregated data (only when viewing all-time)
    feedViewStatsDaily.forEach((d) => {
      const existing = feedViewStatsMap.get(d.feedType);
      if (existing) {
        existing.totalSessions += d.totalSessions;
        existing.totalDuration += typeof d.totalDuration === 'string' ? parseInt(d.totalDuration) : d.totalDuration;
        existing.uniqueUsers = Math.max(existing.uniqueUsers, d.uniqueUsers); // Use MAX since daily is aggregated
        // Recalculate average duration
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

    // Cast Views - Merge data from main table and daily aggregates
    // Strategy:
    // - When timeFilter is set: Only query cast_views (recent data, no need for daily aggregates)
    // - When timeFilter is null (all-time): Merge both cast_views and cast_views_daily
    // - For unique users: Use MAX when merging (since daily stores aggregated unique_users)
    const castViewStatsRecent = await db
      .select({
        feedType: sql<string>`COALESCE(${castViews.feedType}, 'unknown')`,
        totalViews: sql<number>`count(*)::int`,
        uniqueCasts: sql<number>`count(distinct cast_hash)::int`,
        uniqueUsers: sql<number>`count(distinct user_fid)::int`,
      })
      .from(castViews)
      .where(timeFilter ? sql`created_at >= ${timeFilter.toISOString()}` : sql`1=1`)
      .groupBy(sql`COALESCE(${castViews.feedType}, 'unknown')`);

    // Only query daily aggregates when timeFilter is null (all-time view)
    // Daily aggregates contain older data (30+ days) that's been aggregated for cost savings
    const castViewStatsDaily = timeFilter
      ? [] // Skip daily aggregates when time filter is set
      : await db
          .select({
            feedType: castViewsDaily.feedType,
            totalViews: sql<number>`COALESCE(sum(view_count), 0)::int`,
            uniqueCasts: sql<number>`count(distinct cast_hash)::int`,
            uniqueUsers: sql<number>`COALESCE(max(unique_users), 0)::int`,
          })
          .from(castViewsDaily)
          .groupBy(castViewsDaily.feedType);

    // Merge results by feed type
    const castViewStatsMap = new Map<string, {
      feedType: string;
      totalViews: number;
      uniqueCasts: number;
      uniqueUsers: number;
    }>();

    // Add recent data from main table
    castViewStatsRecent.forEach((r) => {
      castViewStatsMap.set(r.feedType, {
        feedType: r.feedType,
        totalViews: r.totalViews,
        uniqueCasts: r.uniqueCasts,
        uniqueUsers: r.uniqueUsers,
      });
    });

    // Add/merge daily aggregated data (only when viewing all-time)
    // For unique casts: Use sum since daily table has one row per cast_hash
    // For unique users: Use MAX since daily stores aggregated unique_users
    castViewStatsDaily.forEach((d) => {
      const existing = castViewStatsMap.get(d.feedType);
      if (existing) {
        existing.totalViews += d.totalViews;
        existing.uniqueCasts += d.uniqueCasts; // Daily table has one row per cast_hash, so sum is accurate
        existing.uniqueUsers = Math.max(existing.uniqueUsers, d.uniqueUsers); // Use MAX since daily is aggregated
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

    // Daily Usage Breakdowns
    // When timeFilter is set: Only query feed_view_sessions (recent data)
    // When timeFilter is null (all-time): Merge both feed_view_sessions and feed_view_sessions_daily
    const dailyBreakdownQuery = timeFilter
      ? sql`
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          feed_type,
          COUNT(*)::int as total_sessions,
          SUM(duration_seconds)::bigint as total_duration_seconds,
          CASE 
            WHEN COUNT(*) > 0 
            THEN ROUND(AVG(duration_seconds))::bigint
            ELSE 0::bigint
          END as avg_duration_seconds,
          COUNT(DISTINCT user_fid)::int as unique_users
        FROM feed_view_sessions
        WHERE created_at >= ${timeFilter.toISOString()}
        GROUP BY DATE_TRUNC('day', created_at), feed_type
        ORDER BY date DESC, feed_type
      `
      : sql`
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
          UNION ALL
          SELECT 
            date,
            feed_type,
            total_sessions,
            total_duration_seconds,
            NULL as user_fid
          FROM feed_view_sessions_daily
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

    // Daily Cast Views Breakdown
    // When timeFilter is set: Only query cast_views (recent data)
    // When timeFilter is null (all-time): Merge both cast_views and cast_views_daily
    const dailyCastViewsQuery = timeFilter
      ? sql`
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COALESCE(feed_type, 'unknown') as feed_type,
          COUNT(*)::int as total_views,
          COUNT(DISTINCT cast_hash)::int as unique_casts,
          COUNT(DISTINCT user_fid)::int as unique_users
        FROM cast_views
        WHERE created_at >= ${timeFilter.toISOString()}
        GROUP BY DATE_TRUNC('day', created_at), COALESCE(feed_type, 'unknown')
        ORDER BY date DESC, feed_type
      `
      : sql`
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
          UNION ALL
          SELECT 
            date,
            feed_type,
            view_count,
            cast_hash,
            NULL as user_fid
          FROM cast_views_daily
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
        total: signedInEver, // All-Time Signed-In Users (canonical metric)
        new: newUsers[0]?.count || 0,
        withRoles: usersWithRoles[0]?.count || 0,
        uniqueActiveUsers: d14ActiveUsers, // 14-Day Active Users (canonical metric)
        miniappOnlyUsers: miniappOnlyUsers, // Users with miniapp but no qualifying activity
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
      ...(await (async () => {
        // First, get active users to extract their FIDs for exclusion in inactive curators
        const activeUsersResult = await (async () => {
        // Get admin FIDs to exclude
        const adminFids = await getAllAdminFids();

        // Get date range for past 30 days (for UI display, but using canonical activity_events)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];

        // Build admin exclusion clause
        const adminExclusion = adminFids.length > 0 
          ? sql`AND ua.user_fid NOT IN (${sql.join(adminFids.map(fid => sql`${fid}`), sql`, `)})`
          : sql``;

        // Query active users for past 30 days using canonical activity_events
        const activeUsersQuery = await db.execute(sql`
          WITH user_activity AS (
            SELECT DISTINCT
              user_fid,
              DATE(created_at) as activity_date
            FROM activity_events
            WHERE created_at >= ${startDate}
          ),
          curation_activity AS (
            SELECT DISTINCT
              user_fid,
              DATE(created_at) as activity_date
            FROM activity_events
            WHERE type = 'save_curate'
              AND created_at >= ${startDate}
          ),
          onchain_activity AS (
            SELECT DISTINCT
              user_fid,
              DATE(created_at) as activity_date
            FROM activity_events
            WHERE type = 'post_reply'
              AND created_at >= ${startDate}
          )
          SELECT
            ua.activity_date::text as date,
            ua.user_fid as fid,
            u.username,
            u.display_name as "displayName",
            u.pfp_url as "pfpUrl",
            CASE WHEN ca.user_fid IS NOT NULL THEN true ELSE false END as curated,
            CASE WHEN oa.user_fid IS NOT NULL THEN true ELSE false END as onchain
          FROM user_activity ua
          LEFT JOIN users u ON u.fid = ua.user_fid
          LEFT JOIN curation_activity ca ON ca.user_fid = ua.user_fid AND ca.activity_date = ua.activity_date
          LEFT JOIN onchain_activity oa ON oa.user_fid = ua.user_fid AND oa.activity_date = ua.activity_date
          WHERE 1=1 ${adminExclusion}
          ORDER BY ua.activity_date DESC, ua.user_fid
        `);

        // Group by date
        const usersByDate = new Map<string, Array<{
          fid: number;
          username: string | null;
          displayName: string | null;
          pfpUrl: string | null;
          curated: boolean;
          onchain: boolean;
        }>>();

        for (const row of activeUsersQuery.rows as any[]) {
          const date = row.date;
          if (!usersByDate.has(date)) {
            usersByDate.set(date, []);
          }
          usersByDate.get(date)!.push({
            fid: row.fid,
            username: row.username,
            displayName: row.displayName,
            pfpUrl: row.pfpUrl,
            curated: row.curated,
            onchain: row.onchain,
          });
        }

          // Convert to array format
          return Array.from(usersByDate.entries()).map(([date, users]) => ({
            date,
            users,
          })).sort((a, b) => b.date.localeCompare(a.date)); // Sort by date descending
        })();

        // Get inactive curators - check ALL curators, not just recent ones
        const inactiveCuratorsResult = await (async () => {
          const curatorFids = await getAllCuratorFids();
          if (curatorFids.length === 0) {
            return {
              notVisited7Days: [],
              notVisited14Days: [],
              neverSignedIn: [],
              miniappInstalled: [],
              miniappNotInstalled: [],
            };
          }

          // Get last activity date for ALL curators from canonical activity_events
          // Also include sign_in_logs for "never signed in" detection
          const lastVisits = await db.execute(sql`
            WITH curator_visits AS (
              SELECT DISTINCT
                user_fid,
                MAX(created_at) as last_visit
              FROM (
                SELECT user_fid, created_at FROM activity_events
                UNION ALL
                SELECT user_fid, created_at FROM sign_in_logs 
                  WHERE user_fid IS NOT NULL 
                  AND success = true
              ) AS all_visits
              WHERE user_fid = ANY(${sql.raw(`ARRAY[${curatorFids.length > 0 ? curatorFids.join(',') : 'NULL'}]`)})
              GROUP BY user_fid
            )
            SELECT
              cv.user_fid as fid,
              cv.last_visit,
              u.username,
              u.display_name as "displayName",
              u.pfp_url as "pfpUrl"
            FROM curator_visits cv
            LEFT JOIN users u ON u.fid = cv.user_fid
          `);

          const visitsMap = new Map<number, { lastVisit: Date; username: string | null; displayName: string | null; pfpUrl: string | null }>();
          for (const row of (lastVisits as any).rows || []) {
            visitsMap.set(row.fid, {
              lastVisit: new Date(row.last_visit),
              username: row.username,
              displayName: row.displayName,
              pfpUrl: row.pfpUrl,
            });
          }

          // Get curators who have never signed in (no successful sign-in records)
          const curatorsWithSignIn = await db.execute(sql`
            SELECT DISTINCT user_fid
            FROM sign_in_logs
            WHERE user_fid IS NOT NULL
              AND success = true
              AND user_fid = ANY(${sql.raw(`ARRAY[${curatorFids.length > 0 ? curatorFids.join(',') : 'NULL'}]`)})
          `);
          
          const signInFidsSet = new Set((curatorsWithSignIn as any).rows?.map((r: any) => r.user_fid) || []);
          
          // Find curators who have never signed in
          const neverSignedInFids = curatorFids.filter(fid => !signInFidsSet.has(fid));
          
          // Get user info for never signed in curators
          const neverSignedInUsers = neverSignedInFids.length > 0
            ? await db.select({
                fid: users.fid,
                username: users.username,
                displayName: users.displayName,
                pfpUrl: users.pfpUrl,
              })
              .from(users)
              .where(sql`fid = ANY(${sql.raw(`ARRAY[${neverSignedInFids.length > 0 ? neverSignedInFids.join(',') : 'NULL'}]`)})`)
            : [];

          const now = new Date();
          const notVisited7Days: Array<{ fid: number; username: string | null; displayName: string | null; pfpUrl: string | null; lastVisit: Date }> = [];
          const notVisited14Days: Array<{ fid: number; username: string | null; displayName: string | null; pfpUrl: string | null; lastVisit: Date }> = [];

          // Categorize ALL curators based on their last visit date
          // Exclude those who have never signed in (they're in a separate category)
          for (const fid of curatorFids) {
            // Skip if never signed in (handled separately)
            if (neverSignedInFids.includes(fid)) {
              continue;
            }

            const visit = visitsMap.get(fid);
            if (!visit) {
              // If no visit data but they've signed in, treat as very old activity
              // This shouldn't happen often, but handle edge case
              continue;
            }
            
            const daysSinceVisit = Math.floor((now.getTime() - visit.lastVisit.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceVisit > 14) {
              notVisited14Days.push({
                fid,
                username: visit.username,
                displayName: visit.displayName,
                pfpUrl: visit.pfpUrl,
                lastVisit: visit.lastVisit,
              });
            } else if (daysSinceVisit > 7) {
              notVisited7Days.push({
                fid,
                username: visit.username,
                displayName: visit.displayName,
                pfpUrl: visit.pfpUrl,
                lastVisit: visit.lastVisit,
              });
            }
          }

          // Sort by last visit date (oldest first)
          notVisited7Days.sort((a, b) => a.lastVisit.getTime() - b.lastVisit.getTime());
          notVisited14Days.sort((a, b) => a.lastVisit.getTime() - b.lastVisit.getTime());

          // Get miniapp installation status for all curators (including active ones for the miniapp status section)
          const miniappInstalledFids = await db
            .select({ userFid: miniappInstallations.userFid })
            .from(miniappInstallations)
            .where(sql`user_fid = ANY(${sql.raw(`ARRAY[${curatorFids.length > 0 ? curatorFids.join(',') : 'NULL'}]`)})`);
          
          const installedFidSet = new Set(miniappInstalledFids.map(m => m.userFid));
          
          // Get all curator user data for miniapp status
          const allCuratorUsers = await db
            .select({
              fid: users.fid,
              username: users.username,
              displayName: users.displayName,
              pfpUrl: users.pfpUrl,
            })
            .from(users)
            .where(sql`fid = ANY(${sql.raw(`ARRAY[${curatorFids.length > 0 ? curatorFids.join(',') : 'NULL'}]`)})`);
          
          const userMap = new Map(allCuratorUsers.map(u => [u.fid, u]));
          
          // Get curators with miniapp installed
          const withMiniapp = Array.from(installedFidSet)
            .map(fid => {
              const user = userMap.get(fid);
              return user ? {
                fid: user.fid,
                username: user.username,
                displayName: user.displayName,
                pfpUrl: user.pfpUrl,
              } : null;
            })
            .filter((u): u is NonNullable<typeof u> => u !== null);
          
          // Get curators without miniapp installed
          const withoutMiniapp = curatorFids
            .filter(fid => !installedFidSet.has(fid))
            .map(fid => {
              const user = userMap.get(fid);
              return user ? {
                fid: user.fid,
                username: user.username,
                displayName: user.displayName,
                pfpUrl: user.pfpUrl,
              } : null;
            })
            .filter((u): u is NonNullable<typeof u> => u !== null);

          return {
            notVisited7Days: notVisited7Days.map(u => ({ ...u, lastVisit: u.lastVisit.toISOString() })),
            notVisited14Days: notVisited14Days.map(u => ({ ...u, lastVisit: u.lastVisit.toISOString() })),
            neverSignedIn: neverSignedInUsers.map(u => ({
              fid: u.fid,
              username: u.username,
              displayName: u.displayName,
              pfpUrl: u.pfpUrl,
            })),
            miniappInstalled: withMiniapp,
            miniappNotInstalled: withoutMiniapp,
          };
        })();

        return {
          activeUsers: activeUsersResult,
          inactiveCurators: inactiveCuratorsResult,
        };
      })()),
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

