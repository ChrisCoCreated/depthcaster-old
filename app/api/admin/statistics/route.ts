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
} from "@/lib/schema";
import { isAdmin, getUserRoles } from "@/lib/roles";

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

    // Unique authenticated users in analytics
    const uniqueAuthenticatedUsersQuery = timeFilter
      ? db.select({ count: sql<number>`count(distinct user_fid)::int` }).from(pageViews).where(sql`user_fid IS NOT NULL AND created_at >= ${timeFilter.toISOString()}`)
      : db.select({ count: sql<number>`count(distinct user_fid)::int` }).from(pageViews).where(sql`user_fid IS NOT NULL`);
    const uniqueAuthenticatedUsers = await uniqueAuthenticatedUsersQuery;

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

    // Feed Analytics
    const feedViewStats = await db
      .select({
        feedType: feedViewSessions.feedType,
        totalSessions: sql<number>`count(*)::int`,
        totalDuration: sql<number>`sum(duration_seconds)::int`,
        avgDuration: sql<number>`avg(duration_seconds)::int`,
        uniqueUsers: sql<number>`count(distinct user_fid)::int`,
      })
      .from(feedViewSessions)
      .where(timeFilter ? sql`created_at >= ${timeFilter.toISOString()}` : sql`1=1`)
      .groupBy(feedViewSessions.feedType);

    const castViewStats = await db
      .select({
        feedType: castViews.feedType,
        totalViews: sql<number>`count(*)::int`,
        uniqueCasts: sql<number>`count(distinct cast_hash)::int`,
        uniqueUsers: sql<number>`count(distinct user_fid)::int`,
      })
      .from(castViews)
      .where(timeFilter ? sql`created_at >= ${timeFilter.toISOString()}` : sql`1=1`)
      .groupBy(castViews.feedType);

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
          avgDurationSeconds: f.avgDuration,
          uniqueUsers: f.uniqueUsers,
        })),
        castViews: castViewStats.map((c) => ({
          feedType: c.feedType || "unknown",
          totalViews: c.totalViews,
          uniqueCasts: c.uniqueCasts,
          uniqueUsers: c.uniqueUsers,
        })),
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
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Statistics API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}

