import { NextRequest, NextResponse } from "next/server";
import { getWeeklyContributorsStats, WeeklyContributor } from "@/lib/statistics";
import { getUser } from "@/lib/users";
import { neynarClient } from "@/lib/neynar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sort contributors alphabetically by display name or username
 */
function sortContributors(contributors: WeeklyContributor[]): WeeklyContributor[] {
  return contributors.sort((a, b) => {
    const aName = a.displayName || a.username || `@user${a.curatorFid}`;
    const bName = b.displayName || b.username || `@user${b.curatorFid}`;
    return aName.localeCompare(bName);
  });
}

/**
 * Enrich contributors with user info from database or Neynar
 */
async function enrichContributors(contributors: WeeklyContributor[]): Promise<WeeklyContributor[]> {
  const enriched: WeeklyContributor[] = [];

  for (const contributor of contributors) {
    try {
      // Try database first
      const dbUser = await getUser(contributor.curatorFid);
      if (dbUser) {
        enriched.push({
          ...contributor,
          username: dbUser.username || undefined,
          displayName: dbUser.displayName || undefined,
          pfpUrl: dbUser.pfpUrl || undefined,
        });
      } else {
        // Fetch from Neynar if not in DB
        try {
          const neynarUsers = await neynarClient.fetchBulkUsers({ fids: [contributor.curatorFid] });
          const neynarUser = neynarUsers.users?.[0];
          if (neynarUser) {
            enriched.push({
              ...contributor,
              username: neynarUser.username,
              displayName: neynarUser.display_name || undefined,
              pfpUrl: neynarUser.pfp_url || undefined,
            });
          } else {
            // Fallback: minimal info
            enriched.push(contributor);
          }
        } catch (error) {
          console.error(`Failed to fetch curator ${contributor.curatorFid} from Neynar:`, error);
          enriched.push(contributor);
        }
      }
    } catch (error) {
      console.error(`Failed to enrich contributor ${contributor.curatorFid}:`, error);
      enriched.push(contributor);
    }
  }

  return enriched;
}

export async function GET(request: NextRequest) {
  try {
    // Get weekly contributors stats
    const stats = await getWeeklyContributorsStats();

    // Enrich with user info
    const topContributors = await enrichContributors(stats.topContributors);
    const allContributors = await enrichContributors(stats.allContributors);

    // Sort alphabetically
    const sortedTopContributors = sortContributors(topContributors);
    const sortedAllContributors = sortContributors(allContributors);

    return NextResponse.json({
      topContributors: sortedTopContributors,
      allContributors: sortedAllContributors,
    });
  } catch (error: unknown) {
    console.error("Weekly contributors API error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to fetch weekly contributors" },
      { status: 500 }
    );
  }
}





















