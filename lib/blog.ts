/**
 * Unified blog utilities for detecting and handling multiple blog platforms
 */

import { isParagraphLink, parseParagraphUrl, ParsedParagraphUrl } from './paragraph';
import { isSubstackLink, parseSubstackUrl, ParsedSubstackUrl } from './substack';

export type BlogPlatform = 'paragraph' | 'substack';

export interface ParsedBlogUrl {
  platform: BlogPlatform;
  paragraph?: ParsedParagraphUrl;
  substack?: ParsedSubstackUrl;
  originalUrl: string;
}

/**
 * Detect which blog platform a URL belongs to
 */
export function isBlogLink(url: string): BlogPlatform | null {
  if (isParagraphLink(url)) {
    return 'paragraph';
  }
  if (isSubstackLink(url)) {
    return 'substack';
  }
  return null;
}

/**
 * Parse a blog URL and return platform-specific parsing results
 */
export function parseBlogUrl(url: string): ParsedBlogUrl | null {
  const platform = isBlogLink(url);
  
  if (!platform) {
    return null;
  }
  
  const result: ParsedBlogUrl = {
    platform,
    originalUrl: url,
  };
  
  if (platform === 'paragraph') {
    result.paragraph = parseParagraphUrl(url);
  } else if (platform === 'substack') {
    result.substack = parseSubstackUrl(url);
  }
  
  return result;
}

// Re-export platform-specific utilities for convenience
export { isParagraphLink, parseParagraphUrl, type ParsedParagraphUrl } from './paragraph';
export { isSubstackLink, parseSubstackUrl, getSubstackRssUrl, type ParsedSubstackUrl } from './substack';


