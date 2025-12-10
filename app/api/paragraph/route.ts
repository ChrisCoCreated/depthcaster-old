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

    if (!url) {
      return NextResponse.json(
        { error: "URL parameter is required" },
        { status: 400 }
      );
    }

    // Parse the Paragraph URL
    const parsed = parseParagraphUrl(url);
    
    if (!parsed.publicationSlug || !parsed.postSlug) {
      return NextResponse.json(
        { error: "Invalid Paragraph URL format" },
        { status: 400 }
      );
    }

    // Remove @ prefix from publication slug if present
    const cleanPublicationSlug = parsed.publicationSlug.replace(/^@/, "");

    // Initialize Paragraph API client
    const api = new ParagraphAPI();

    try {
      let postData: Awaited<ReturnType<typeof api.getPost>>;
      let publicationData: Awaited<ReturnType<typeof api.getPublicationBySlug>> | null = null;

      // Try to fetch post directly using publication slug and post slug
      // This is the most efficient approach
      try {
        postData = await api.getPost(
          {
            publicationSlug: cleanPublicationSlug,
            postSlug: parsed.postSlug,
          },
          { includeContent: true }
        );
      } catch (error: unknown) {
        // If that fails and it's a custom domain, try alternative approach
        if (parsed.isCustomDomain && parsed.domain) {
          // For custom domains, first get publication by domain
          try {
            publicationData = await api.getPublicationByDomain(parsed.domain);
            
            // Then fetch post by publication ID and post slug
            postData = await api.getPost(
              {
                publicationId: publicationData.id,
                postSlug: parsed.postSlug,
              },
              { includeContent: true }
            );
          } catch {
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
          publicationData = await api.getPublicationBySlug(cleanPublicationSlug);
        } catch {
          // Publication fetch is optional, continue without it
          console.warn("Could not fetch publication data");
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

