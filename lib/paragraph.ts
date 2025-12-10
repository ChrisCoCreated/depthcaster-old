/**
 * Utility functions for parsing and detecting Paragraph links
 */

export interface ParsedParagraphUrl {
  publicationSlug: string | null;
  postSlug: string | null;
  isCustomDomain: boolean;
  domain: string | null;
  originalUrl: string;
}

/**
 * Check if a URL is a Paragraph link
 */
export function isParagraphLink(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Check for paragraph.xyz domain
    if (hostname === 'paragraph.xyz' || hostname === 'www.paragraph.xyz') {
      return true;
    }
    
    // Check for paragraph.xyz subdomains (like custom domains)
    // Note: Custom domains would need to be checked via API
    // For now, we'll check if it matches paragraph.xyz patterns
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Parse a Paragraph URL to extract publication slug and post slug
 * Supports formats:
 * - paragraph.xyz/@publication/post-slug
 * - paragraph.xyz/publication/post-slug
 * - Custom domains (requires API check)
 */
export function parseParagraphUrl(url: string): ParsedParagraphUrl {
  const result: ParsedParagraphUrl = {
    publicationSlug: null,
    postSlug: null,
    isCustomDomain: false,
    domain: null,
    originalUrl: url,
  };

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname;

    // Check if it's paragraph.xyz
    if (hostname === 'paragraph.xyz' || hostname === 'www.paragraph.xyz') {
      // Parse path: /@publication/post-slug or /publication/post-slug
      const pathMatch = pathname.match(/^\/(?:@)?([^/]+)\/([^/]+)/);
      if (pathMatch) {
        result.publicationSlug = pathMatch[1];
        result.postSlug = pathMatch[2];
        result.domain = hostname;
      }
    } else {
      // Could be a custom domain - mark for API check
      result.isCustomDomain = true;
      result.domain = hostname;
      
      // Try to parse path anyway
      const pathMatch = pathname.match(/^\/([^/]+)\/([^/]+)/);
      if (pathMatch) {
        // For custom domains, first segment might be publication slug
        result.publicationSlug = pathMatch[1];
        result.postSlug = pathMatch[2];
      }
    }
  } catch (error) {
    // Invalid URL
    console.error('Error parsing Paragraph URL:', error);
  }

  return result;
}

