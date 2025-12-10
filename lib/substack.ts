/**
 * Utility functions for parsing and detecting Substack links
 */

export interface ParsedSubstackUrl {
  hostname: string;
  postSlug: string | null;
  originalUrl: string;
}

/**
 * Check if a URL is a Substack link
 */
export function isSubstackLink(url: string): boolean {
  try {
    // Normalize URL - add protocol if missing
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    
    // Remove any trailing punctuation that might have been included in URL extraction
    normalizedUrl = normalizedUrl.replace(/[.,;:!?)\]'"`]+$/, '');
    
    const urlObj = new URL(normalizedUrl);
    const hostname = urlObj.hostname.toLowerCase();
    
    console.log('[Substack] Checking URL:', url, 'normalized:', normalizedUrl, 'hostname:', hostname);
    
    // Check if hostname ends with .substack.com
    if (hostname.endsWith('.substack.com')) {
      console.log('[Substack] ✓ Detected Substack link:', url);
      return true;
    }
    
    console.log('[Substack] ✗ Not a Substack link:', url, '(hostname:', hostname, ')');
    return false;
  } catch (error) {
    console.log('[Substack] ✗ Error checking URL:', url, error);
    return false;
  }
}

/**
 * Parse a Substack URL to extract publication hostname and post slug
 * Supports formats:
 * - https://publication.substack.com/p/post-slug
 * - https://publication.substack.com/p/post-slug?query=params
 */
export function parseSubstackUrl(url: string): ParsedSubstackUrl {
  const result: ParsedSubstackUrl = {
    hostname: '',
    postSlug: null,
    originalUrl: url,
  };

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname;

    // Check if it's a Substack domain
    if (hostname.endsWith('.substack.com')) {
      result.hostname = hostname;
      
      // Parse path: /p/post-slug or /post-slug
      const pathMatch = pathname.match(/^\/p\/([^/]+)/) || pathname.match(/^\/([^/]+)/);
      if (pathMatch) {
        result.postSlug = pathMatch[1];
      }
    }
  } catch (error) {
    console.error('Error parsing Substack URL:', error);
  }

  return result;
}

/**
 * Generate RSS feed URL from Substack hostname
 */
export function getSubstackRssUrl(hostname: string): string {
  return `https://${hostname}/feed`;
}

