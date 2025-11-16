import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { curatedCasts, users, userRoles } from "@/lib/schema";
import { neynarClient } from "@/lib/neynar";
import { getUser } from "@/lib/users";
import { sql, eq, inArray } from "drizzle-orm";
import { CURATOR_ROLES, hasCuratorOrAdminRole, getUserRoles } from "@/lib/roles";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const searchQuery = searchParams.get("q");

    // If searching, return users who have curated anything
    if (searchQuery && searchQuery.length >= 2) {
      // Get all unique curator FIDs from curated casts
      const curatorResults = await db
        .select({
          curatorFid: curatedCasts.curatorFid,
        })
        .from(curatedCasts)
        .where(sql`${curatedCasts.curatorFid} IS NOT NULL`);

      const curatorFids = [...new Set(
        curatorResults
          .map((r) => r.curatorFid)
          .filter((fid): fid is number => fid !== null)
      )];

      if (curatorFids.length === 0) {
        return NextResponse.json({ curators: [] });
      }

      // Search for users matching the query
      const searchResult = await neynarClient.searchUser({
        q: searchQuery,
        limit: 20,
      });

      const matchingUsers = (searchResult.result?.users || []).filter((u: any) =>
        curatorFids.includes(u.fid)
      );

      const curators = matchingUsers.map((u: any) => ({
        fid: u.fid,
        username: u.username,
        displayName: u.display_name || undefined,
        pfpUrl: u.pfp_url || undefined,
      }));

      return NextResponse.json({ curators });
    }

    // Default: Get curators with curator role and all users who have curated
    // First, get all unique curator FIDs from curated casts
    const curatorResults = await db
      .select({
        curatorFid: curatedCasts.curatorFid,
      })
      .from(curatedCasts)
      .where(sql`${curatedCasts.curatorFid} IS NOT NULL`);

    const curatorFids = [...new Set(
      curatorResults
        .map((r) => r.curatorFid)
        .filter((fid): fid is number => fid !== null)
    )];

    if (curatorFids.length === 0) {
      return NextResponse.json({ curators: [], allCurators: [] });
    }

    // Get users with curator role from database
    const curatorRoleUsers = await db
      .selectDistinct({ fid: users.fid })
      .from(users)
      .innerJoin(userRoles, eq(users.fid, userRoles.userFid))
      .where(inArray(userRoles.role, CURATOR_ROLES));

    const curatorRoleFids = new Set(curatorRoleUsers.map((u) => u.fid));

    // Fetch curator info for all FIDs
    type CuratorInfo = {
      fid: number;
      username?: string;
      displayName?: string;
      pfpUrl?: string;
      hasRole?: boolean;
    };
    const allCurators: CuratorInfo[] = [];
    const curatorsWithRole: CuratorInfo[] = [];

    for (const fid of curatorFids) {
      try {
        let curatorInfo: {
          fid: number;
          username?: string;
          displayName?: string;
          pfpUrl?: string;
          hasRole?: boolean;
        } | null = null;

        // Try database first
        const dbUser = await getUser(fid);
        if (dbUser) {
          const roles = await getUserRoles(fid);
          curatorInfo = {
            fid,
            username: dbUser.username || undefined,
            displayName: dbUser.displayName || undefined,
            pfpUrl: dbUser.pfpUrl || undefined,
            hasRole: hasCuratorOrAdminRole(roles),
          };
        } else {
          // Fetch from Neynar if not in DB
          try {
            const neynarUsers = await neynarClient.fetchBulkUsers({ fids: [fid] });
            const neynarUser = neynarUsers.users?.[0];
            if (neynarUser) {
              curatorInfo = {
                fid,
                username: neynarUser.username,
                displayName: neynarUser.display_name || undefined,
                pfpUrl: neynarUser.pfp_url || undefined,
                hasRole: curatorRoleFids.has(fid),
              };
            }
          } catch (error) {
            console.error(`Failed to fetch curator ${fid} from Neynar:`, error);
          }
        }

        if (curatorInfo) {
          allCurators.push(curatorInfo);
          if (curatorInfo.hasRole) {
            curatorsWithRole.push(curatorInfo);
          }
        } else {
          // Fallback: create minimal info
          const fallbackInfo = {
            fid,
            username: undefined,
            displayName: undefined,
            pfpUrl: undefined,
            hasRole: curatorRoleFids.has(fid),
          };
          allCurators.push(fallbackInfo);
          if (fallbackInfo.hasRole) {
            curatorsWithRole.push(fallbackInfo);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch curator ${fid}:`, error);
      }
    }

    // Sort by display name or username
    const sortCurators = (curators: typeof allCurators) => {
      return curators.sort((a, b) => {
        const aName = a.displayName || a.username || `@user${a.fid}`;
        const bName = b.displayName || b.username || `@user${b.fid}`;
        return aName.localeCompare(bName);
      });
    };

    return NextResponse.json({
      curators: sortCurators(curatorsWithRole),
      allCurators: sortCurators(allCurators),
    });
  } catch (error: unknown) {
    console.error("Curators API error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || "Failed to fetch curators" },
      { status: 500 }
    );
  }
}

