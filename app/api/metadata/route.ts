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

    // Handle CAIP-2 format URLs (blockchain transaction identifiers)
    // Format: eip155:CHAIN_ID/tx:0x... or eip155:CHAIN_ID/erc721:0x...
    let targetUrlString = url;
    const caip2Match = url.match(/^eip155:(\d+)\/(tx|erc721):(0x[a-fA-F0-9]+)$/i);
    if (caip2Match) {
      const chainId = parseInt(caip2Match[1]);
      const txHash = caip2Match[3];
      
      // Convert to explorer URL based on chain ID
      let explorerUrl: string | null = null;
      switch (chainId) {
        case 1: // Ethereum Mainnet
          explorerUrl = `https://etherscan.io/tx/${txHash}`;
          break;
        case 8453: // Base
          explorerUrl = `https://basescan.org/tx/${txHash}`;
          break;
        case 10: // Optimism
          explorerUrl = `https://optimistic.etherscan.io/tx/${txHash}`;
          break;
        case 42161: // Arbitrum
          explorerUrl = `https://arbiscan.io/tx/${txHash}`;
          break;
        case 137: // Polygon
          explorerUrl = `https://polygonscan.com/tx/${txHash}`;
          break;
        default:
          // Unknown chain - return 404
          return NextResponse.json(
            { error: "Unsupported blockchain network" },
            { status: 404 }
          );
      }
      
      // Use the converted explorer URL
      targetUrlString = explorerUrl;
    }

    // Validate URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(targetUrlString);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL" },
        { status: 400 }
      );
    }

    // Only HTTP(S) protocols are supported by unfurl.js
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return NextResponse.json(
        { error: "Only HTTP(S) protocols are supported" },
        { status: 400 }
      );
    }

    const isXEmbed = targetUrl.hostname === 'x.com' || targetUrl.hostname === 'twitter.com' || targetUrl.hostname === 'www.twitter.com' || targetUrl.hostname === 'www.x.com';

    // Use Twitter oEmbed API for Twitter/X links (unfurl.js doesn't handle oEmbed directly)
    if (isXEmbed) {
      try {
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(targetUrlString)}`;
        
        const oembedResponse = await fetch(oembedUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          },
        });

        if (oembedResponse.ok) {
          const oembedData = await oembedResponse.json();
          
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
            url: targetUrlString,
            title: oembedData.title || `${oembedData.author_name ? `Tweet by ${oembedData.author_name}` : 'Tweet'}`,
            description: description,
            image: imageUrl,
            author_name: oembedData.author_name || null,
            author_url: oembedData.author_url || null,
          };
          
          return NextResponse.json(result);
        }
      } catch {
        // Fall through to unfurl.js
      }
    }

    // Use unfurl.js for all other URLs
    const result = await unfurl(targetUrlString);
    
    // Filter out Twitter emoji SVGs if present
    let imageUrl = result.open_graph?.images?.[0]?.url || result.twitter_card?.images?.[0]?.url || null;
    if (imageUrl && (imageUrl.includes('twimg.com/emoji') || imageUrl.includes('/svg/'))) {
      imageUrl = null;
    }
    
    const response = {
      url: targetUrlString,
      title: result.open_graph?.title || result.twitter_card?.title || result.title || null,
      description: result.open_graph?.description || result.twitter_card?.description || result.description || null,
      image: imageUrl,
    };
    
    return NextResponse.json(response);
  } catch (error) {
    // Check if it's an expected error from unfurl.js
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check for DNS/network errors (expected for invalid/unreachable domains)
    const errorAny = error as any;
    const isNetworkError = errorAny?.code === 'ENOTFOUND' || 
                          errorAny?.code === 'ETIMEDOUT' || 
                          errorAny?.code === 'ECONNREFUSED' ||
                          errorAny?.code === 'EHOSTUNREACH' ||
                          errorAny?.errno === 'ENOTFOUND' ||
                          errorAny?.errno === 'ETIMEDOUT' ||
                          errorAny?.errno === 'ECONNREFUSED' ||
                          errorAny?.type === 'system' ||
                          errorMessage?.includes('ENOTFOUND') ||
                          errorMessage?.includes('ETIMEDOUT') ||
                          errorMessage?.includes('ECONNREFUSED') ||
                          errorMessage?.includes('getaddrinfo');
    
    const isHttpStatusError = errorMessage?.includes('BAD_HTTP_STATUS') || 
                              errorMessage?.includes('http status not OK');
    const isContentTypeError = errorMessage?.includes('WRONG_CONTENT_TYPE') ||
                               errorMessage?.includes('Wrong content type header');
    const isProtocolError = errorMessage?.includes('Only HTTP(S) protocols are supported');
    
    if (isNetworkError || isHttpStatusError || isContentTypeError || isProtocolError) {
      // Don't log expected errors - they're normal for:
      // - Invalid/unreachable domains (DNS errors, connection refused, etc.)
      // - Inaccessible URLs (404, 403, etc.)
      // - Non-HTML content (JSON, XML, PDF, images, etc.)
      return NextResponse.json(
        { error: "URL is not accessible or does not contain HTML content" },
        { status: 404 }
      );
    }
    
    // Only log unexpected errors
    console.error("[Metadata API] Metadata fetch error:", error);
    if (error instanceof Error) {
      console.error("[Metadata API] Error stack:", error.stack);
    }
    return NextResponse.json(
      { error: errorMessage || "Failed to fetch metadata" },
      { status: 500 }
    );
  }
}
