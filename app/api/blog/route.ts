import { NextRequest, NextResponse } from "next/server";
import { isBlogLink, parseBlogUrl } from "@/lib/blog";
import { ParagraphAPI } from "@paragraph_xyz/sdk";
import { fetchSubstackPost } from "@/lib/rss-fetcher";
import { fetchGenericArticle } from "@/lib/extractors/genericArticle";

/**
 * Unified blog API route that handles both Paragraph and Substack posts
 * Returns normalized response format for both platforms
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

    // Detect blog platform
    const platform = isBlogLink(url);
    
    if (!platform) {
      return NextResponse.json(
        { error: "Not a supported blog platform" },
        { status: 400 }
      );
    }

    try {
      if (platform === 'paragraph') {
        // Handle Paragraph posts using SDK
        return await handleParagraphPost(url);
      } else if (platform === 'substack') {
        // Handle Substack posts using RSS
        return await handleSubstackPost(url);
      } else if (platform === 'generic_article') {
        // Handle generic article extraction
        return await handleGenericArticle(url);
      }
    } catch (error: unknown) {
      console.error(`[Blog API] Error fetching ${platform} post:`, error);
      
      // Check if it's a 404 error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStatus = (error as { status?: number })?.status;
      
      // Check if it's a client error (400) that was already handled
      if (errorMessage.includes('notes are not supported') || 
          errorMessage.includes('home feed URLs are not supported') ||
          errorMessage.includes('Cannot determine publication')) {
        // Re-throw to let handleSubstackPost handle it
        throw error;
      }
      
      // Handle generic article specific errors
      if (platform === 'generic_article') {
        if (errorMessage.includes('does not appear to be an article page') ||
            errorMessage.includes('Extracted content is too short') ||
            errorMessage.includes('Could not extract article content')) {
          return NextResponse.json(
            { 
              error: "Full text unavailable – open externally?",
              details: errorMessage
            },
            { status: 400 }
          );
        }
        
        if (errorMessage.includes("Failed to fetch article") || errorStatus === 404) {
          return NextResponse.json(
            { error: "Article not found" },
            { status: 404 }
          );
        }
      }
      
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

  // Initialize Paragraph API client
  const api = new ParagraphAPI();

  let postData: Awaited<ReturnType<typeof api.getPost>>;
  let publicationData: Awaited<ReturnType<typeof api.getPublicationBySlug>> | null = null;

  // Try to fetch post directly using publication slug and post slug
  try {
    postData = await api.getPost(
      {
        publicationSlug: cleanPublicationSlug,
        postSlug: parsed.paragraph.postSlug,
      },
      { includeContent: true }
    );
  } catch (error: unknown) {
    // If that fails and it's a custom domain, try alternative approach
    if (parsed.paragraph.isCustomDomain && parsed.paragraph.domain) {
      // For custom domains, first get publication by domain
      try {
        publicationData = await api.getPublicationByDomain(parsed.paragraph.domain);
        
        // Then fetch post by publication ID and post slug
        postData = await api.getPost(
          {
            publicationId: publicationData.id,
            postSlug: parsed.paragraph.postSlug,
          },
          { includeContent: true }
        );
      } catch (domainError) {
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
    } catch (pubError) {
      // Publication fetch is optional, continue without it
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
  try {
    const postData = await fetchSubstackPost(url);
    
    // Return normalized format (same as Paragraph)
    return NextResponse.json({
      ...postData,
      publication: {
        ...postData.publication,
        platform: 'substack',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // If it's a note, return a helpful error
    if (errorMessage.includes('notes are not available') || errorMessage.includes('notes are not supported')) {
      return NextResponse.json(
        { 
          error: "Substack notes are not supported. Only full posts can be previewed.",
          note: "Notes are shorter-form content that aren't included in RSS feeds."
        },
        { status: 400 }
      );
    }
    
    // If it's a home feed URL or unsupported format, return a helpful error
    if (errorMessage.includes('home feed URLs are not supported') || 
        errorMessage.includes('Cannot determine publication')) {
      return NextResponse.json(
        { 
          error: errorMessage,
          suggestion: "Please use the direct publication post URL (e.g., publication.substack.com/p/post-slug)."
        },
        { status: 400 }
      );
    }
    
    throw error;
  }
}

/**
 * Handle generic article extraction
 */
async function handleGenericArticle(url: string): Promise<NextResponse> {
  try {
    console.log('[Blog API] Fetching generic article:', url);
    const articleData = await fetchGenericArticle(url);
    console.log('[Blog API] Successfully extracted article:', articleData.title);
    
    // Return normalized format (same as Paragraph/Substack)
    return NextResponse.json({
      id: articleData.id,
      title: articleData.title,
      subtitle: articleData.subtitle,
      markdown: articleData.markdown,
      staticHtml: articleData.staticHtml,
      coverImage: articleData.coverImage,
      publication: {
        id: articleData.publication.id,
        slug: articleData.publication.slug,
        name: articleData.publication.name,
      },
      publishedAt: articleData.publishedAt,
      createdAt: articleData.createdAt,
      url: articleData.url,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Blog API] Error fetching generic article:', errorMessage);
    console.error('[Blog API] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Re-throw to let main handler deal with it
    throw error;
  }
}


