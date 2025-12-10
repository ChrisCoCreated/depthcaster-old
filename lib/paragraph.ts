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
    // Normalize URL - add protocol if missing
    let normalizedUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      normalizedUrl = 'https://' + url;
    }
    
    const urlObj = new URL(normalizedUrl);
    const hostname = urlObj.hostname.toLowerCase();
    
    console.log('[Paragraph] Checking URL:', url, 'hostname:', hostname);
    
    // Check for paragraph.com or paragraph.xyz domain (with or without www)
    const isParagraphDomain = hostname === 'paragraph.com' || 
                              hostname === 'www.paragraph.com' ||
                              hostname === 'paragraph.xyz' || 
                              hostname === 'www.paragraph.xyz';
    
    if (isParagraphDomain) {
      // Also check if it has a path that looks like a post (publication/post-slug)
      const pathname = urlObj.pathname;
      const pathMatch = pathname.match(/^\/(?:@)?[^/]+\/[^/]+/);
      console.log('[Paragraph] Pathname:', pathname, 'matches pattern:', !!pathMatch);
      // Should have at least /publication/post-slug pattern
      if (pathMatch) {
        console.log('[Paragraph] ✓ Detected Paragraph link:', url);
        return true;
      }
    }
    
    // Check for paragraph.xyz subdomains (like custom domains)
    // Note: Custom domains would need to be checked via API
    // For now, we'll check if it matches paragraph.xyz patterns
    
    console.log('[Paragraph] ✗ Not a Paragraph link:', url);
    return false;
  } catch (error) {
    console.log('[Paragraph] ✗ Error checking URL:', url, error);
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

    // Check if it's paragraph.com or paragraph.xyz
    if (hostname === 'paragraph.com' || hostname === 'www.paragraph.com' ||
        hostname === 'paragraph.xyz' || hostname === 'www.paragraph.xyz') {
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

