import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { cacheUser } from "@/lib/cache";
import { deduplicateRequest } from "@/lib/neynar-batch";
import { upsertUser } from "@/lib/users";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  try {
    const { fid: fidParam } = await params;
    const fid = parseInt(fidParam);
    const isFid = !isNaN(fid);
    const searchParams = request.nextUrl.searchParams;
    const viewerFidParam = searchParams.get("viewerFid");
    const viewerFid = viewerFidParam ? parseInt(viewerFidParam) : undefined;

    // Check if it's a username (not a valid FID)
    if (!isFid) {
      // Treat as username
      const username = fidParam;

      // Search for user by username
      const searchResult = await neynarClient.searchUser({
        q: username,
        limit: 1,
      });
      
      const foundUser = searchResult.result?.users?.[0];
      if (!foundUser) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      // Fetch full user data using FID (to use caching)
      const userFid = foundUser.fid;
      const cacheKey = cacheUser.generateKey([userFid]);
      const cached = cacheUser.get(cacheKey);
      
      if (cached?.users?.[0] && !viewerFid) {
        const user = cached.users[0];
        return NextResponse.json({
          fid: user.fid,
          username: user.username,
          display_name: user.display_name,
          pfp_url: user.pfp_url,
          bio: user.profile?.bio?.text,
          follower_count: user.follower_count,
          following_count: user.following_count,
          verified: user.verified_addresses?.eth_addresses?.length > 0 || user.verified_addresses?.sol_addresses?.length > 0,
          isFollowing: false,
        });
      }

      // Fetch from Neynar using FID
      const response = await deduplicateRequest(cacheKey, async () => {
        return await neynarClient.fetchBulkUsers({ 
          fids: [userFid],
          viewerFid,
        });
      });

      const user = response.users?.[0];
      if (!user) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      // Cache the response (only if no viewerFid to avoid caching viewer-specific data)
      if (!viewerFid) {
        cacheUser.set(cacheKey, response);
      }

      return NextResponse.json({
        fid: user.fid,
        username: user.username,
        display_name: user.display_name,
        pfp_url: user.pfp_url,
        bio: user.profile?.bio?.text,
        follower_count: user.follower_count,
        following_count: user.following_count,
        verified: user.verified_addresses?.eth_addresses?.length > 0 || user.verified_addresses?.sol_addresses?.length > 0,
        isFollowing: user.viewer_context?.following || false,
      });
    }

    // Original FID-based logic
    // Check cache first (only if no viewerFid)
    const cacheKey = cacheUser.generateKey([fid]);
    const cached = cacheUser.get(cacheKey);
    if (cached?.users?.[0] && !viewerFid) {
      const user = cached.users[0];
      return NextResponse.json({
        fid: user.fid,
        username: user.username,
        display_name: user.display_name,
        pfp_url: user.pfp_url,
        bio: user.profile?.bio?.text,
        follower_count: user.follower_count,
        following_count: user.following_count,
        verified: user.verified_addresses?.eth_addresses?.length > 0 || user.verified_addresses?.sol_addresses?.length > 0,
        isFollowing: false,
      });
    }

    // Fetch from Neynar
    const response = await deduplicateRequest(cacheKey, async () => {
      return await neynarClient.fetchBulkUsers({ 
        fids: [fid],
        viewerFid,
      });
    });

    const user = response.users?.[0];
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Cache the response (only if no viewerFid to avoid caching viewer-specific data)
    if (!viewerFid) {
      cacheUser.set(cacheKey, response);
    }

    return NextResponse.json({
      fid: user.fid,
      username: user.username,
      display_name: user.display_name,
      pfp_url: user.pfp_url,
      bio: user.profile?.bio?.text,
      follower_count: user.follower_count,
      following_count: user.following_count,
      verified: user.verified_addresses?.eth_addresses?.length > 0 || user.verified_addresses?.sol_addresses?.length > 0,
      isFollowing: user.viewer_context?.following || false,
    });
  } catch (error: any) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch user profile" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ fid: string }> }
) {
  try {
    const { fid: fidParam } = await params;
    const fid = parseInt(fidParam);
    const body = await request.json();
    const { displayName, bio, signerUuid } = body;

    if (isNaN(fid)) {
      return NextResponse.json(
        { error: "Invalid FID" },
        { status: 400 }
      );
    }

    if (!signerUuid) {
      return NextResponse.json(
        { error: "signerUuid is required" },
        { status: 400 }
      );
    }

    // Verify the user is updating their own profile
    const signer = await neynarClient.lookupSigner({ signerUuid });
    if (signer.fid !== fid) {
      return NextResponse.json(
        { error: "Unauthorized: Can only update your own profile" },
        { status: 403 }
      );
    }

    // Prepare update data for Neynar
    const updateData: { signerUuid: string; bio?: string; displayName?: string } = {
      signerUuid,
    };
    
    if (bio !== undefined) {
      updateData.bio = bio;
    }
    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }

    // Update user profile via Neynar API
    await neynarClient.updateUser(updateData);

    // Fetch updated user data from Neynar (bypass cache to get fresh data)
    const response = await neynarClient.fetchBulkUsers({ fids: [fid] });
    const user = response.users?.[0];

    if (!user) {
      return NextResponse.json(
        { error: "User not found after update" },
        { status: 404 }
      );
    }

    // Update cache with fresh data
    const cacheKey = cacheUser.generateKey([fid]);
    cacheUser.set(cacheKey, response);

    // Update local database
    await upsertUser(fid, {
      displayName: user.display_name,
      username: user.username,
      pfpUrl: user.pfp_url,
    });

    return NextResponse.json({
      fid: user.fid,
      username: user.username,
      display_name: user.display_name,
      pfp_url: user.pfp_url,
      bio: user.profile?.bio?.text,
      follower_count: user.follower_count,
      following_count: user.following_count,
      verified: user.verified_addresses?.eth_addresses?.length > 0 || user.verified_addresses?.sol_addresses?.length > 0,
    });
  } catch (error: any) {
    console.error("Error updating user profile:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update user profile" },
      { status: 500 }
    );
  }
}

