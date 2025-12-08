import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { isAdmin, getUserRoles } from "@/lib/roles";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const adminFid = searchParams.get("adminFid");
    const castHash = searchParams.get("castHash");
    const limitParam = searchParams.get("limit");

    // Check admin access
    if (!adminFid) {
      return NextResponse.json(
        { error: "adminFid is required" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(adminFid);
    if (isNaN(adminFidNum)) {
      return NextResponse.json(
        { error: "Invalid adminFid" },
        { status: 400 }
      );
    }

    // Verify admin status
    const adminUser = await db.select().from(users).where(eq(users.fid, adminFidNum)).limit(1);
    if (adminUser.length === 0) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }
    const roles = await getUserRoles(adminFidNum);
    if (!isAdmin(roles)) {
      return NextResponse.json(
        { error: "User does not have admin or superadmin role" },
        { status: 403 }
      );
    }

    // Validate cast hash
    if (!castHash) {
      return NextResponse.json(
        { error: "castHash is required" },
        { status: 400 }
      );
    }

    // Normalize cast hash (remove 0x prefix if present, then add it back for API)
    const normalizedHash = castHash.startsWith("0x") ? castHash : `0x${castHash}`;
    
    // Validate hash format (should be hex string)
    if (!/^0x[a-fA-F0-9]+$/.test(normalizedHash)) {
      return NextResponse.json(
        { error: "Invalid cast hash format" },
        { status: 400 }
      );
    }

    // Set limit (default 100, max 100)
    const limit = limitParam ? Math.min(parseInt(limitParam), 100) : 100;
    if (isNaN(limit) || limit < 1) {
      return NextResponse.json(
        { error: "Invalid limit" },
        { status: 400 }
      );
    }

    // Call Neynar API
    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "NEYNAR_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const url = `https://api.neynar.com/v2/farcaster/cast/quotes/?limit=${limit}&identifier=${normalizedHash}&type=hash`;
    console.log("[Cast Quotes API] Fetching from Neynar:", { url, normalizedHash, limit });
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
    });

    console.log("[Cast Quotes API] Neynar response status:", response.status, response.statusText);

    if (!response.ok) {
      let errorMessage = "Failed to fetch cast quotes";
      try {
        const errorData = await response.json();
        console.error("[Cast Quotes API] Neynar error response:", errorData);
        errorMessage = errorData.message || errorData.error || `Neynar API error: ${response.status} ${response.statusText}`;
      } catch (e) {
        const errorText = await response.text().catch(() => "");
        console.error("[Cast Quotes API] Neynar error text:", errorText);
        errorMessage = `Neynar API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`;
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("[Cast Quotes API] Neynar response data structure:", {
      hasResult: !!data.result,
      hasQuotes: !!data.quotes,
      resultType: typeof data.result,
      resultIsArray: Array.isArray(data.result),
      resultKeys: data.result && typeof data.result === 'object' ? Object.keys(data.result) : [],
      dataKeys: Object.keys(data),
      fullData: JSON.stringify(data).substring(0, 1000),
    });
    
    // Handle different possible response structures from Neynar API
    let quotes: any[] = [];
    
    if (Array.isArray(data)) {
      // Response is directly an array
      quotes = data;
    } else if (data.result) {
      if (Array.isArray(data.result)) {
        // result is an array
        quotes = data.result;
      } else if (data.result.quotes && Array.isArray(data.result.quotes)) {
        // result.quotes is an array
        quotes = data.result.quotes;
      } else if (data.result.casts && Array.isArray(data.result.casts)) {
        // result.casts is an array
        quotes = data.result.casts;
      }
    } else if (data.quotes && Array.isArray(data.quotes)) {
      quotes = data.quotes;
    } else if (data.casts && Array.isArray(data.casts)) {
      quotes = data.casts;
    }
    
    console.log("[Cast Quotes API] Extracted quotes count:", quotes.length);

    return NextResponse.json({
      quotes,
      count: quotes.length,
    });
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Cast quotes API error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch cast quotes" },
      { status: 500 }
    );
  }
}

