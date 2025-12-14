/**
 * Unified blog utilities for detecting and handling multiple blog platforms
 */

import { isParagraphLink, parseParagraphUrl, ParsedParagraphUrl } from './paragraph';
import { isSubstackLink, parseSubstackUrl, ParsedSubstackUrl } from './substack';

export type BlogPlatform = 'paragraph' | 'substack' | 'generic_article';

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
  // Attempt generic article extraction for all other URLs
  // The extraction logic will determine if it's actually an article
  return 'generic_article';
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
  // generic_article doesn't need additional parsing
  
  return result;
}

/**
 * Check if URL is a generic article link
 * (Always returns true for non-Paragraph/Substack URLs)
 */
export function isGenericArticleLink(url: string): boolean {
  return !isParagraphLink(url) && !isSubstackLink(url);
}

// Re-export platform-specific utilities for convenience
export { isParagraphLink, parseParagraphUrl, type ParsedParagraphUrl } from './paragraph';
export { isSubstackLink, parseSubstackUrl, getSubstackRssUrl, type ParsedSubstackUrl } from './substack';


