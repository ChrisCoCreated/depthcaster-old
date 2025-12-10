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
    
    // Check if hostname ends with .substack.com (subdomain) or is exactly substack.com (main domain)
    if (hostname.endsWith('.substack.com') || hostname === 'substack.com' || hostname === 'www.substack.com') {
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

    // Check if it's a Substack domain (subdomain or main domain)
    if (hostname.endsWith('.substack.com') || hostname === 'substack.com' || hostname === 'www.substack.com') {
      result.hostname = hostname;
      
      // For main domain (substack.com), check different URL formats
      if (hostname === 'substack.com' || hostname === 'www.substack.com') {
        // Check for note URL format: /@username/note/c-xxxxx
        const noteMatch = pathname.match(/^\/@([^/]+)\/note\/([^/]+)/);
        if (noteMatch) {
          // For notes on main domain, we'll use the username as a pseudo-hostname
          result.hostname = `${noteMatch[1]}.substack.com`;
          result.postSlug = noteMatch[2];
        } 
        // Check for home feed URL format: /home/post/p-xxxxx (not supported)
        else if (pathname.match(/^\/home\/post\//)) {
          // Home feed URLs don't have publication info, can't fetch RSS
          // Leave hostname as substack.com to trigger error handling
          const postMatch = pathname.match(/\/p-([^/?]+)/);
          if (postMatch) {
            result.postSlug = postMatch[1];
          }
        }
        // Regular post on main domain (unlikely but handle it)
        else {
          const pathMatch = pathname.match(/^\/p\/([^/]+)/) || pathname.match(/^\/([^/]+)/);
          if (pathMatch) {
            result.postSlug = pathMatch[1];
          }
        }
      } else {
        // Subdomain format: /p/post-slug or /post-slug
        const pathMatch = pathname.match(/^\/p\/([^/]+)/) || pathname.match(/^\/([^/]+)/);
        if (pathMatch) {
          result.postSlug = pathMatch[1];
        }
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

