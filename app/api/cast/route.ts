import { NextRequest, NextResponse } from "next/server";
import { neynarClient } from "@/lib/neynar";
import { trackCuratedCastInteraction } from "@/lib/interactions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signerUuid, text, parent, embeds, channelId, parentAuthorFid } = body;

    if (!signerUuid) {
      return NextResponse.json(
        { error: "signerUuid is required" },
        { status: 400 }
      );
    }

    const cast = await neynarClient.publishCast({
      signerUuid,
      text: text || "",
      parent,
      embeds,
      channelId,
      parentAuthorFid,
    });

    // Get user FID from signer
    let userFid: number | undefined;
    try {
      const signer = await neynarClient.lookupSigner({ signerUuid });
      userFid = signer.fid;
    } catch (error) {
      console.error("Error fetching signer:", error);
    }

    // Track interaction if this is a reply or quote to a curated cast thread
    if (userFid) {
      // Check if this is a quote (has embeds with cast_id)
      const isQuote = embeds?.some((embed: any) => embed.cast_id);
      
      if (isQuote && embeds) {
        // Track quote interactions for each quoted cast
        for (const embed of embeds) {
          if (embed.cast_id?.hash) {
            trackCuratedCastInteraction(embed.cast_id.hash, "quote", userFid).catch((error) => {
              console.error("Error tracking quote interaction:", error);
            });
          }
        }
      } else if (parent) {
        // Track as reply interaction
        trackCuratedCastInteraction(parent, "reply", userFid).catch((error) => {
          console.error("Error tracking reply interaction:", error);
        });
      }
    }

    return NextResponse.json({ success: true, cast });
  } catch (error: any) {
    console.error("Cast API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to publish cast" },
      { status: 500 }
    );
  }
}

