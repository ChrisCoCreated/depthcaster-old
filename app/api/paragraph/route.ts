import { NextRequest, NextResponse } from "next/server";
import { parseParagraphUrl } from "@/lib/paragraph";
import { ParagraphAPI } from "@paragraph_xyz/sdk";

/**
 * Fetch Paragraph post data using the Paragraph SDK
 * Uses the official SDK which handles all API endpoint details
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get("url");

    console.log('[Paragraph API] Received request for URL:', url);

    if (!url) {
      console.log('[Paragraph API] Missing URL parameter');
      return NextResponse.json(
        { error: "URL parameter is required" },
        { status: 400 }
      );
    }

    // Parse the Paragraph URL
    const parsed = parseParagraphUrl(url);
    console.log('[Paragraph API] Parsed URL:', parsed);
    
    if (!parsed.publicationSlug || !parsed.postSlug) {
      console.log('[Paragraph API] Invalid URL format - missing publicationSlug or postSlug');
      return NextResponse.json(
        { error: "Invalid Paragraph URL format" },
        { status: 400 }
      );
    }

    // Remove @ prefix from publication slug if present
    const cleanPublicationSlug = parsed.publicationSlug.replace(/^@/, "");
    console.log('[Paragraph API] Clean publication slug:', cleanPublicationSlug, 'post slug:', parsed.postSlug);

    // Initialize Paragraph API client
    const api = new ParagraphAPI();

    try {
      let postData: Awaited<ReturnType<typeof api.getPost>>;
      let publicationData: Awaited<ReturnType<typeof api.getPublicationBySlug>> | null = null;

      // Try to fetch post directly using publication slug and post slug
      // This is the most efficient approach
      try {
        console.log('[Paragraph API] Attempting to fetch post by slugs...');
        postData = await api.getPost(
          {
            publicationSlug: cleanPublicationSlug,
            postSlug: parsed.postSlug,
          },
          { includeContent: true }
        );
        console.log('[Paragraph API] Successfully fetched post:', postData.id);
      } catch (error: unknown) {
        console.log('[Paragraph API] Failed to fetch by slugs, error:', error);
        // If that fails and it's a custom domain, try alternative approach
        if (parsed.isCustomDomain && parsed.domain) {
          console.log('[Paragraph API] Trying custom domain approach for:', parsed.domain);
          // For custom domains, first get publication by domain
          try {
            publicationData = await api.getPublicationByDomain(parsed.domain);
            console.log('[Paragraph API] Found publication by domain:', publicationData.id);
            
            // Then fetch post by publication ID and post slug
            postData = await api.getPost(
              {
                publicationId: publicationData.id,
                postSlug: parsed.postSlug,
              },
              { includeContent: true }
            );
            console.log('[Paragraph API] Successfully fetched post by domain:', postData.id);
          } catch (domainError) {
            console.log('[Paragraph API] Custom domain approach failed:', domainError);
            // If custom domain approach fails, throw original error
            throw error;
          }
        } else {
          // Re-throw the original error
          throw error;
        }
      }

      // Fetch publication data if we don't have it yet
      if (!publicationData) {
        try {
          console.log('[Paragraph API] Fetching publication by slug:', cleanPublicationSlug);
          publicationData = await api.getPublicationBySlug(cleanPublicationSlug);
          console.log('[Paragraph API] Found publication:', publicationData.id);
        } catch (pubError) {
          // Publication fetch is optional, continue without it
          console.warn('[Paragraph API] Could not fetch publication data:', pubError);
        }
      }

      // Return formatted post data
      return NextResponse.json({
        id: postData.id,
        title: postData.title,
        subtitle: postData.subtitle,
        markdown: postData.markdown,
        staticHtml: postData.staticHtml,
        coverImage: postData.imageUrl,
        publication: publicationData || {
          id: "",
          slug: cleanPublicationSlug,
          name: undefined,
        },
        publishedAt: postData.publishedAt,
        createdAt: postData.updatedAt || postData.publishedAt,
        url: url,
      });
    } catch (error: unknown) {
      console.error("Error fetching Paragraph post:", error);
      
      // Check if it's a 404 error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStatus = (error as { status?: number })?.status;
      
      if (errorMessage.includes("not found") || errorStatus === 404) {
        return NextResponse.json(
          { error: "Post not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: errorMessage || "Failed to fetch Paragraph post" },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("[Paragraph API] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: errorMessage || "Internal server error" },
      { status: 500 }
    );
  }
}

