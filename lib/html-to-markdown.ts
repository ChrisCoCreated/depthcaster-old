/**
 * Shared HTML to Markdown conversion utility
 * Used by both Substack RSS fetcher and generic article extractor
 */

import TurndownService from 'turndown';

const turndownService = new TurndownService({
  headingStyle: 'atx', // Use # for headers
  codeBlockStyle: 'fenced', // Use ``` for code blocks
  bulletListMarker: '-', // Use - for lists
  emDelimiter: '*', // Use * for emphasis
  strongDelimiter: '**', // Use ** for strong
});

// Configure Turndown to handle strikethrough elements
turndownService.addRule('strikethrough', {
  filter: (node) => {
    return node.nodeName === 'S' || 
           node.nodeName === 'STRIKE' || 
           node.nodeName === 'DEL' ||
           (node as HTMLElement).tagName?.toLowerCase() === 's' ||
           (node as HTMLElement).tagName?.toLowerCase() === 'strike' ||
           (node as HTMLElement).tagName?.toLowerCase() === 'del';
  },
  replacement: (content) => `~~${content}~~`,
});

// Remove script and style tags before conversion
turndownService.addRule('removeScripts', {
  filter: ['script', 'style'],
  replacement: () => '',
});

/**
 * Convert HTML to markdown with cleaning
 */
export function htmlToMarkdown(html: string): string {
  try {
    // Clean up HTML before conversion - remove images entirely
    let cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove image tags completely (they'll be handled separately via coverImage)
      .replace(/<img[^>]*>/gi, '')
      .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '')
      .replace(/<picture[^>]*>[\s\S]*?<\/picture>/gi, '');
    
    // Convert to markdown
    let markdown = turndownService.turndown(cleaned);
    
    // Clean up any remaining image markdown syntax
    markdown = markdown
      // Remove image markdown ![alt](url) - handle multiline cases
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      // Remove orphaned image link fragments ](url) - handle multiline
      .replace(/\]\(https?:\/\/[^)]+\)/g, '')
      // Remove standalone image URLs on their own line
      .replace(/^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?$/gmi, '')
      // Remove lines that are just brackets or image fragments
      .replace(/^\[+\s*$/gm, '')
      .replace(/^\s*\]+$/gm, '')
      // Remove orphaned brackets at start/end of lines
      .replace(/^\[+\s*/gm, '')
      .replace(/\s*\]+$/gm, '')
      // Remove empty lines with just brackets
      .replace(/^\s*\[\s*\]\s*$/gm, '')
      // Clean up excessive whitespace
      .replace(/\n{3,}/g, '\n\n')
      // Remove leading/trailing whitespace and empty lines
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 || line === '') // Keep single empty lines for paragraph breaks
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    return markdown;
  } catch (error) {
    console.error('[HTML to Markdown] Error converting HTML to markdown:', error);
    // Fallback: return plain text if conversion fails
    return html.replace(/<[^>]+>/g, '').trim();
  }
}

/**
 * Export turndown service for advanced usage
 */
export { turndownService };

