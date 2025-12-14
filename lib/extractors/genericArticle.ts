/**
 * Generic article extraction for news sites and blogs
 * Uses Mozilla Readability with fallbacks for content extraction
 */

import { htmlToMarkdown } from '../html-to-markdown';

export interface GenericArticle {
  id: string; // URL as ID
  title: string;
  subtitle?: string;
  markdown?: string;
  staticHtml?: string;
  coverImage?: string;
  publication: {
    id: string; // domain
    slug: string; // domain
    name?: string; // extracted from site name or domain
  };
  publishedAt?: string;
  createdAt?: string;
  url: string;
}

/**
 * Remove tracking parameters from URLs
 */
export function removeTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'ref', 'source', 'medium', 'campaign',
      'fbclid', 'gclid', 'msclkid', 'twclid',
      'igshid', 'mc_cid', 'mc_eid',
      '_ga', '_gid', 'utm_id',
    ];
    
    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    return urlObj.toString();
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * Sanitize HTML by removing unwanted elements
 */
function sanitizeHtml(html: string): string {
  // Remove script, style, nav, header, footer, aside, ad-related elements
  const unwantedSelectors = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    '[class*="ad"]', '[class*="advertisement"]', '[class*="cookie"]',
    '[class*="banner"]', '[class*="social"]', '[class*="share"]',
    '[class*="newsletter"]', '[id*="ad"]', '[id*="advertisement"]',
    '[id*="cookie"]', '[id*="banner"]', '[id*="social"]',
    '[id*="share"]', '[id*="newsletter"]',
  ];
  
  let cleaned = html;
  
  // Remove unwanted elements
  unwantedSelectors.forEach(selector => {
    const regex = new RegExp(`<${selector}[^>]*>[\s\S]*?<\/${selector}>`, 'gi');
    cleaned = cleaned.replace(regex, '');
    // Also remove self-closing tags
    cleaned = cleaned.replace(new RegExp(`<${selector}[^>]*\/?>`, 'gi'), '');
  });
  
  return cleaned;
}

/**
 * Extract cover image from HTML
 */
function extractCoverImage(html: string, dom?: Document): string | undefined {
  // Try og:image meta tag first
  const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+name=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (ogImageMatch) {
    return ogImageMatch[1];
  }
  
  // Try to find first large image in article
  if (dom) {
    const images = dom.querySelectorAll('article img, main img, [role="article"] img');
    for (const img of Array.from(images)) {
      const src = (img as HTMLImageElement).src;
      if (src && !src.includes('logo') && !src.includes('icon')) {
        return src;
      }
    }
  }
  
  // Fallback: first img tag
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }
  
  return undefined;
}

/**
 * Extract title from HTML
 */
function extractTitle(html: string, dom?: Document): string {
  // Try og:title first
  const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+name=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (ogTitleMatch) {
    return ogTitleMatch[1];
  }
  
  // Try h1 in article
  if (dom) {
    const h1 = dom.querySelector('article h1, main h1, [role="article"] h1');
    if (h1 && h1.textContent) {
      return h1.textContent.trim();
    }
  }
  
  // Try document title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  
  return 'Untitled Article';
}

/**
 * Extract publication name from HTML
 */
function extractPublicationName(html: string, domain: string, dom?: Document): string | undefined {
  // Try og:site_name
  const siteNameMatch = html.match(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i) ||
                       html.match(/<meta\s+name=["']og:site_name["']\s+content=["']([^"']+)["']/i);
  if (siteNameMatch) {
    return siteNameMatch[1];
  }
  
  // Try to find site name in common locations
  if (dom) {
    const siteName = dom.querySelector('[rel="publisher"], [itemprop="publisher"]');
    if (siteName && siteName.textContent) {
      return siteName.textContent.trim();
    }
  }
  
  // Fallback to domain name (capitalized)
  return domain.split('.')[0]
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Fallback: Extract content from <article> tag
 */
function extractFromArticleTag(dom: Document): string | null {
  const article = dom.querySelector('article');
  if (article) {
    return article.innerHTML;
  }
  return null;
}

/**
 * Fallback: Extract longest cluster of consecutive <p> tags
 */
function extractFromParagraphs(dom: Document): string | null {
  const paragraphs = dom.querySelectorAll('p');
  if (paragraphs.length === 0) {
    return null;
  }
  
  let bestCluster: Element[] = [];
  let currentCluster: Element[] = [];
  
  for (const p of Array.from(paragraphs)) {
    const text = p.textContent?.trim() || '';
    if (text.length > 50) { // Substantial paragraph
      currentCluster.push(p);
    } else {
      if (currentCluster.length > bestCluster.length) {
        bestCluster = currentCluster;
      }
      currentCluster = [];
    }
  }
  
  // Check final cluster
  if (currentCluster.length > bestCluster.length) {
    bestCluster = currentCluster;
  }
  
  if (bestCluster.length >= 3) {
    const container = dom.createElement('div');
    bestCluster.forEach(p => container.appendChild(p.cloneNode(true)));
    return container.innerHTML;
  }
  
  return null;
}

/**
 * Extract article content using Readability with fallbacks
 */
async function extractArticleContent(html: string, url: string, document: Document): Promise<{
  content: string;
  title: string;
  excerpt?: string;
}> {
  let content: string | null = null;
  let title = extractTitle(html, document);
  let excerpt: string | undefined;
  
  // Try Readability first (dynamic import for serverless compatibility)
  try {
    const { Readability } = await import('@mozilla/readability');
    const reader = new Readability(document);
    const article = reader.parse();
    
    if (article && article.textContent && article.textContent.length > 200 && article.content) {
      content = article.content;
      title = article.title || title;
      excerpt = article.excerpt || undefined;
    }
  } catch (error) {
    console.log('[Generic Article] Readability failed, trying fallbacks:', error);
  }
  
  // Fallback 1: Extract from <article> tag
  if (!content) {
    content = extractFromArticleTag(document);
  }
  
  // Fallback 2: Extract from paragraph clusters
  if (!content) {
    content = extractFromParagraphs(document);
  }
  
  if (!content) {
    throw new Error('Could not extract article content');
  }
  
  return { content, title, excerpt };
}

/**
 * Fetch and extract generic article content
 */
export async function fetchGenericArticle(url: string): Promise<GenericArticle> {
  console.log('[Generic Article] Fetching:', url);
  
  try {
    // Fetch HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Depthcaster/1.0)',
      },
    });
    
    if (!response.ok) {
      console.error('[Generic Article] Fetch failed:', response.status, response.statusText);
      throw new Error(`Failed to fetch article: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log('[Generic Article] Fetched HTML, length:', html.length);
    
    // Parse domain from URL
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace('www.', '');
    
    // Create DOM for analysis using dynamic imports for serverless compatibility
    let document: Document;
    
    try {
      // Dynamic import for jsdom to avoid ESM/CommonJS issues in serverless
      const { JSDOM } = await import('jsdom');
      const dom = new JSDOM(html, { url });
      document = dom.window.document;
      console.log('[Generic Article] Created DOM successfully');
    } catch (error) {
      console.error('[Generic Article] Failed to create DOM:', error);
      throw new Error('Failed to parse HTML');
    }
    
    // Attempt extraction (we try for all URLs)
    let rawContent: string;
    let title: string;
    let excerpt: string | undefined;
    
    try {
      console.log('[Generic Article] Attempting content extraction...');
      const extracted = await extractArticleContent(html, url, document);
      rawContent = extracted.content;
      title = extracted.title;
      excerpt = extracted.excerpt;
      console.log('[Generic Article] Extraction successful, content length:', rawContent.length);
    } catch (error) {
      console.error('[Generic Article] Extraction failed:', error);
      throw error;
    }
    
    // Sanitize HTML
    console.log('[Generic Article] Sanitizing HTML...');
    const sanitizedHtml = sanitizeHtml(rawContent);
    
    // Convert to markdown
    console.log('[Generic Article] Converting to markdown...');
    const markdown = htmlToMarkdown(sanitizedHtml);
    
    // Check content length
    const textContent = markdown.replace(/[#*\[\]()]/g, '').trim();
    if (textContent.length < 200) {
      console.warn('[Generic Article] Content too short:', textContent.length);
      throw new Error('Extracted content is too short (< 200 characters)');
    }
    
    // Extract metadata
    const coverImage = extractCoverImage(html, document);
    const publicationName = extractPublicationName(html, domain, document);
    
    // Extract published date if available
    const publishedDateMatch = html.match(/<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i) ||
                                 html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
    const publishedAt = publishedDateMatch ? publishedDateMatch[1] : undefined;
    
    console.log('[Generic Article] Successfully processed article:', title);
    
    return {
      id: url,
      title,
      subtitle: excerpt,
      markdown,
      staticHtml: sanitizedHtml,
      coverImage: coverImage ? removeTrackingParams(coverImage) : undefined,
      publication: {
        id: domain,
        slug: domain,
        name: publicationName,
      },
      publishedAt,
      createdAt: publishedAt,
      url: removeTrackingParams(url),
    };
  } catch (error) {
    console.error('[Generic Article] Error in fetchGenericArticle:', error);
    // Let the error propagate - the existing embed metadata system will handle it
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  }
}

