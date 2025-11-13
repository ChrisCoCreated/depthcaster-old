import { NextRequest, NextResponse } from "next/server";
import { unfurl } from "unfurl.js";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "URL parameter is required" },
        { status: 400 }
      );
    }

    // Validate URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL" },
        { status: 400 }
      );
    }

    const isXEmbed = targetUrl.hostname === 'x.com' || targetUrl.hostname === 'twitter.com' || targetUrl.hostname === 'www.twitter.com' || targetUrl.hostname === 'www.x.com';

    console.log(`[Metadata API] Processing URL: ${targetUrl.toString()}, isXEmbed: ${isXEmbed}`);

    // Use Twitter oEmbed API for Twitter/X links (unfurl.js doesn't handle oEmbed directly)
    if (isXEmbed) {
      try {
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(targetUrl.toString())}`;
        console.log(`[Metadata API] Fetching Twitter oEmbed from: ${oembedUrl}`);
        
        const oembedResponse = await fetch(oembedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          },
        });

        console.log(`[Metadata API] Twitter oEmbed response status: ${oembedResponse.status}`);

        if (oembedResponse.ok) {
          const oembedData = await oembedResponse.json();
          console.log(`[Metadata API] Twitter oEmbed data:`, JSON.stringify(oembedData, null, 2));
          
          // Filter out Twitter emoji SVGs (warning triangle placeholder)
          const thumbnailUrl = oembedData.thumbnail_url;
          const isTwitterEmoji = thumbnailUrl && (thumbnailUrl.includes('twimg.com/emoji') || thumbnailUrl.includes('/svg/'));
          const imageUrl = isTwitterEmoji ? null : thumbnailUrl;
          
          // Extract description from oEmbed HTML
          let description: string | null = null;
          if (oembedData.html) {
            try {
              // Parse the HTML to extract text content from the <p> tag
              const htmlContent = oembedData.html;
              // Extract content from <p> tag inside blockquote
              const pMatch = htmlContent.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
              if (pMatch) {
                let text = pMatch[1];
                // Remove HTML tags
                text = text.replace(/<[^>]+>/g, ' ');
                // Decode HTML entities
                text = text.replace(/&nbsp;/g, ' ')
                          .replace(/&amp;/g, '&')
                          .replace(/&lt;/g, '<')
                          .replace(/&gt;/g, '>')
                          .replace(/&quot;/g, '"')
                          .replace(/&#39;/g, "'")
                          .replace(/<br\s*\/?>/gi, '\n');
                // Decode numeric entities
                text = text.replace(/&#(\d+);/g, (_: string, dec: string) => String.fromCharCode(parseInt(dec, 10)));
                // Clean up whitespace
                text = text.replace(/\s+/g, ' ').trim();
                if (text) {
                  description = text;
                }
              }
            } catch (error) {
              console.error('[Metadata API] Error extracting description from oEmbed HTML:', error);
            }
          }
          
          const result = {
            url: targetUrl.toString(),
            title: oembedData.title || `${oembedData.author_name ? `Tweet by ${oembedData.author_name}` : 'Tweet'}`,
            description: description,
            image: imageUrl,
            author_name: oembedData.author_name || null,
            author_url: oembedData.author_url || null,
          };
          
          console.log(`[Metadata API] Returning Twitter metadata:`, JSON.stringify(result, null, 2));
          return NextResponse.json(result);
        } else {
          const errorText = await oembedResponse.text();
          console.error(`[Metadata API] Twitter oEmbed API error response: ${errorText}`);
        }
      } catch (error) {
        console.error("[Metadata API] Twitter oEmbed API error:", error);
        // Fall through to unfurl.js
      }
    }

    // Use unfurl.js for all other URLs
    console.log(`[Metadata API] Using unfurl.js for URL: ${targetUrl.toString()}`);
    const result = await unfurl(targetUrl.toString());
    console.log(`[Metadata API] Unfurl result:`, JSON.stringify(result, null, 2));
    
    // Filter out Twitter emoji SVGs if present
    let imageUrl = result.open_graph?.images?.[0]?.url || result.twitter_card?.images?.[0]?.url || null;
    if (imageUrl && (imageUrl.includes('twimg.com/emoji') || imageUrl.includes('/svg/'))) {
      imageUrl = null;
    }
    
    const response = {
      url: targetUrl.toString(),
      title: result.open_graph?.title || result.twitter_card?.title || result.title || null,
      description: result.open_graph?.description || result.twitter_card?.description || result.description || null,
      image: imageUrl,
    };
    
    console.log(`[Metadata API] Returning metadata:`, JSON.stringify(response, null, 2));
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[Metadata API] Metadata fetch error:", error);
    console.error("[Metadata API] Error stack:", error.stack);
    return NextResponse.json(
      { error: error.message || "Failed to fetch metadata" },
      { status: 500 }
    );
  }
}
