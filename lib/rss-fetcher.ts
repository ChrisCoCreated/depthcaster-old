/**
 * RSS feed fetching and parsing utilities for Substack
 */

import Parser from 'rss-parser';
import { parseSubstackUrl, getSubstackRssUrl } from './substack';
import { htmlToMarkdown } from './html-to-markdown';

const parser = new Parser({
  customFields: {
    item: ['content:encoded', 'content:encodedSnippet'],
  },
});

export interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  'content:encoded'?: string;
  author?: string;
  guid?: string;
}

export interface RssFeed {
  title?: string;
  description?: string;
  link?: string;
  items: RssItem[];
}

export interface SubstackPost {
  id: string;
  title: string;
  subtitle?: string;
  markdown?: string;
  staticHtml?: string;
  coverImage?: string;
  publication: {
    id: string;
    slug: string;
    name?: string;
  };
  publishedAt?: string;
  createdAt?: string;
  url: string;
}

/**
 * Normalize URL for comparison (remove trailing slash, query params, fragments)
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove query params and fragments
    urlObj.search = '';
    urlObj.hash = '';
    // Remove trailing slash
    let normalized = urlObj.toString();
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized.toLowerCase();
  } catch {
    // If URL parsing fails, just normalize the string
    return url.replace(/\/$/, '').replace(/\?.*$/, '').replace(/#.*$/, '').toLowerCase();
  }
}

/**
 * Fetch RSS feed from URL
 */
export async function fetchSubstackRss(rssUrl: string, offset?: number): Promise<RssFeed> {
  let url = rssUrl;
  if (offset !== undefined && offset > 0) {
    url = `${rssUrl}?offset=${offset}`;
  }

  console.log('[RSS Fetcher] Fetching RSS feed:', url);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Depthcaster/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  return parseRssFeed(xml);
}

/**
 * Parse RSS XML string
 */
export async function parseRssFeed(xml: string): Promise<RssFeed> {
  try {
    const parsed = await parser.parseString(xml);
    return {
      title: parsed.title,
      description: parsed.description,
      link: parsed.link,
      items: parsed.items.map((item) => ({
        title: item.title || '',
        link: item.link || '',
        pubDate: item.pubDate,
        content: item.content,
        contentSnippet: item.contentSnippet,
        'content:encoded': (item as any)['content:encoded'],
        author: (item as any).creator || (item as any).author,
        guid: item.guid,
      })),
    };
  } catch (error) {
    console.error('[RSS Fetcher] Error parsing RSS feed:', error);
    throw new Error('Failed to parse RSS feed');
  }
}

/**
 * Find a post in the RSS feed by matching URL
 */
export function findPostInFeed(feed: RssFeed, targetUrl: string): RssItem | null {
  const normalizedTarget = normalizeUrl(targetUrl);
  
  for (const item of feed.items) {
    const normalizedItemLink = normalizeUrl(item.link);
    if (normalizedItemLink === normalizedTarget) {
      return item;
    }
  }
  
  return null;
}

/**
 * Extract cover image from HTML content
 */
function extractCoverImage(html: string): string | undefined {
  // Try to find og:image or first large image
  const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (ogImageMatch) {
    return ogImageMatch[1];
  }
  
  // Try to find first img tag with src
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }
  
  return undefined;
}

// htmlToMarkdown is now imported from shared utility

/**
 * Fetch Substack post by URL
 * Handles RSS fetching, parsing, matching, and pagination
 */
export async function fetchSubstackPost(url: string): Promise<SubstackPost> {
  const parsed = parseSubstackUrl(url);
  
  if (!parsed.hostname) {
    throw new Error('Invalid Substack URL format');
  }

  // Check if this is a note URL (notes are on substack.com/@username/note/...)
  const isNote = url.includes('/note/');
  
  if (isNote) {
    // Notes are typically not in RSS feeds
    throw new Error('Substack notes are not available via RSS feed. Only full posts are supported.');
  }

  // Check if this is a home feed URL (substack.com/home/post/p-...)
  // These don't have publication info, so we can't fetch RSS
  if (parsed.hostname === 'substack.com' || parsed.hostname === 'www.substack.com') {
    if (url.includes('/home/post/')) {
      throw new Error('Substack home feed URLs are not supported. Please use the direct publication post URL (e.g., publication.substack.com/p/post-slug).');
    }
    // If hostname is still substack.com (not a subdomain), we can't fetch RSS
    if (!parsed.hostname.endsWith('.substack.com') || parsed.hostname === 'substack.com' || parsed.hostname === 'www.substack.com') {
      throw new Error('Cannot determine publication from Substack URL. Please use a direct publication post URL (e.g., publication.substack.com/p/post-slug).');
    }
  }

  const rssUrl = getSubstackRssUrl(parsed.hostname);
  const publicationSlug = parsed.hostname.replace('.substack.com', '');
  
  // Try to find post in feed, with pagination if needed
  const MAX_PAGES = 5; // Limit pagination to prevent excessive requests
  const ITEMS_PER_PAGE = 25; // Typical RSS feed page size
  
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * ITEMS_PER_PAGE;
    console.log(`[RSS Fetcher] Fetching RSS feed page ${page + 1} (offset: ${offset})`);
    
    try {
      const feed = await fetchSubstackRss(rssUrl, offset > 0 ? offset : undefined);
      const post = findPostInFeed(feed, url);
      
      if (post) {
        console.log('[RSS Fetcher] Found post in feed:', post.title);
        
        // Extract content - prefer content:encoded, fallback to content
        const htmlContent = post['content:encoded'] || post.content || '';
        const coverImage = htmlContent ? extractCoverImage(htmlContent) : undefined;
        
        // Convert HTML to markdown
        const markdown = htmlContent ? htmlToMarkdown(htmlContent) : undefined;
        
        // Parse publication name from feed
        const publicationName = feed.title || publicationSlug;
        
        return {
          id: post.guid || post.link,
          title: post.title,
          subtitle: undefined, // Substack RSS doesn't typically include subtitle
          markdown,
          staticHtml: htmlContent,
          coverImage,
          publication: {
            id: publicationSlug,
            slug: publicationSlug,
            name: publicationName,
          },
          publishedAt: post.pubDate,
          createdAt: post.pubDate,
          url: url,
        };
      }
      
      // If we didn't find it and there are no more items, stop
      if (feed.items.length === 0) {
        break;
      }
      
      console.log(`[RSS Fetcher] Post not found in page ${page + 1}, trying next page...`);
    } catch (error) {
      console.error(`[RSS Fetcher] Error fetching page ${page + 1}:`, error);
      // If it's the first page, throw the error
      if (page === 0) {
        throw error;
      }
      // Otherwise, break and return not found
      break;
    }
  }
  
  throw new Error('Post not found in RSS feed');
}


