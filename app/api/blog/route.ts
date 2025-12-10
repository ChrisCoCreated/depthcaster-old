import { NextRequest, NextResponse } from "next/server";
import { isBlogLink, parseBlogUrl } from "@/lib/blog";
import { ParagraphAPI } from "@paragraph_xyz/sdk";
import { fetchSubstackPost } from "@/lib/rss-fetcher";

/**
 * Unified blog API route that handles both Paragraph and Substack posts
 * Returns normalized response format for both platforms
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get("url");

    console.log('[Blog API] Received request for URL:', url);

    if (!url) {
      console.log('[Blog API] Missing URL parameter');
      return NextResponse.json(
        { error: "URL parameter is required" },
        { status: 400 }
      );
    }

    // Detect blog platform
    const platform = isBlogLink(url);
    
    if (!platform) {
      console.log('[Blog API] Not a supported blog platform:', url);
      return NextResponse.json(
        { error: "Not a supported blog platform" },
        { status: 400 }
      );
    }

    console.log('[Blog API] Detected platform:', platform);

    try {
      if (platform === 'paragraph') {
        // Handle Paragraph posts using SDK
        return await handleParagraphPost(url);
      } else if (platform === 'substack') {
        // Handle Substack posts using RSS
        return await handleSubstackPost(url);
      }
    } catch (error: unknown) {
      console.error(`[Blog API] Error fetching ${platform} post:`, error);
      
      // Check if it's a 404 error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStatus = (error as { status?: number })?.status;
      
      if (errorMessage.includes("not found") || errorStatus === 404 || errorMessage.includes("Post not found")) {
        return NextResponse.json(
          { error: "Post not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: errorMessage || `Failed to fetch ${platform} post` },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("[Blog API] General error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: errorMessage || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Handle Paragraph post fetching
 */
async function handleParagraphPost(url: string): Promise<NextResponse> {
  const parsed = parseBlogUrl(url);
  
  if (!parsed || !parsed.paragraph || !parsed.paragraph.publicationSlug || !parsed.paragraph.postSlug) {
    return NextResponse.json(
      { error: "Invalid Paragraph URL format" },
      { status: 400 }
    );
  }

  // Remove @ prefix from publication slug if present
  const cleanPublicationSlug = parsed.paragraph.publicationSlug.replace(/^@/, "");
  console.log('[Blog API] Clean publication slug:', cleanPublicationSlug, 'post slug:', parsed.paragraph.postSlug);

  // Initialize Paragraph API client
  const api = new ParagraphAPI();

  let postData: Awaited<ReturnType<typeof api.getPost>>;
  let publicationData: Awaited<ReturnType<typeof api.getPublicationBySlug>> | null = null;

  // Try to fetch post directly using publication slug and post slug
  try {
    console.log('[Blog API] Attempting to fetch Paragraph post by slugs...');
    postData = await api.getPost(
      {
        publicationSlug: cleanPublicationSlug,
        postSlug: parsed.paragraph.postSlug,
      },
      { includeContent: true }
    );
    console.log('[Blog API] Successfully fetched Paragraph post:', postData.id);
  } catch (error: unknown) {
    console.log('[Blog API] Failed to fetch by slugs, error:', error);
    // If that fails and it's a custom domain, try alternative approach
    if (parsed.paragraph.isCustomDomain && parsed.paragraph.domain) {
      console.log('[Blog API] Trying custom domain approach for:', parsed.paragraph.domain);
      // For custom domains, first get publication by domain
      try {
        publicationData = await api.getPublicationByDomain(parsed.paragraph.domain);
        console.log('[Blog API] Found publication by domain:', publicationData.id);
        
        // Then fetch post by publication ID and post slug
        postData = await api.getPost(
          {
            publicationId: publicationData.id,
            postSlug: parsed.paragraph.postSlug,
          },
          { includeContent: true }
        );
        console.log('[Blog API] Successfully fetched Paragraph post by domain:', postData.id);
      } catch (domainError) {
        console.log('[Blog API] Custom domain approach failed:', domainError);
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
      console.log('[Blog API] Fetching Paragraph publication by slug:', cleanPublicationSlug);
      publicationData = await api.getPublicationBySlug(cleanPublicationSlug);
      console.log('[Blog API] Found Paragraph publication:', publicationData.id);
    } catch (pubError) {
      // Publication fetch is optional, continue without it
      console.warn('[Blog API] Could not fetch Paragraph publication data:', pubError);
    }
  }

  // Return formatted post data (normalized format)
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
}

/**
 * Handle Substack post fetching
 */
async function handleSubstackPost(url: string): Promise<NextResponse> {
  console.log('[Blog API] Fetching Substack post:', url);
  
  const postData = await fetchSubstackPost(url);
  
  console.log('[Blog API] Successfully fetched Substack post:', postData.id);
  
  // Return normalized format (same as Paragraph)
  return NextResponse.json(postData);
}


