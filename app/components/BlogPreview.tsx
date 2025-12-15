"use client";

import { useState, useEffect, useRef } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { isBlogLink } from "@/lib/blog";

interface BlogPost {
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

interface BlogPreviewProps {
  url: string;
  onSuccess?: () => void; // Callback when preview successfully loads
}

export function BlogPreview({ url, onSuccess }: BlogPreviewProps) {
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const onSuccessCalledRef = useRef(false);
  
  // Signal success when post loads (only once per post)
  useEffect(() => {
    if (!loading && post && !error && onSuccess && !onSuccessCalledRef.current) {
      onSuccessCalledRef.current = true;
      onSuccess();
    }
  }, [loading, post, error, onSuccess]);
  
  // Reset the ref when URL changes
  useEffect(() => {
    onSuccessCalledRef.current = false;
  }, [url]);

  useEffect(() => {
    const fetchPost = async () => {
      try {
        console.log('[BlogPreview] Fetching post for URL:', url);
        setLoading(true);
        setError(null);
        const apiUrl = `/api/blog?url=${encodeURIComponent(url)}`;
        console.log('[BlogPreview] API URL:', apiUrl);
        const response = await fetch(apiUrl);
        
        console.log('[BlogPreview] Response status:', response.status);
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[BlogPreview] Error response:', errorText);
          if (response.status === 404) {
            setError("Article not found");
          } else {
            setError("Failed to load article");
          }
          return;
        }

        const data = await response.json();
        console.log('[BlogPreview] Received post data:', data);
        setPost(data);
      } catch (err) {
        console.error("[BlogPreview] Error fetching blog post:", err);
        setError("Failed to load article");
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [url]);

  if (loading) {
    return (
      <div className="my-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 dark:border-gray-400"></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">Loading article...</span>
        </div>
      </div>
    );
  }

  if (error || !post) {
    // Return null to allow the existing embed metadata system to handle it
    return null;
  }

  const displayContent = post.markdown || "";
  
  // Helper to remove images and other markdown syntax from preview
  const cleanMarkdownForPreview = (md: string): string => {
    return md
      // Remove images completely ![alt](url) or ](url) fragments
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
      .replace(/\]\([^)]+\)/g, '') // Remove leftover ](url) fragments
      // Remove standalone image URLs on their own line
      .replace(/^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?$/gmi, '')
      // Remove links but keep text [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Clean up any orphaned brackets
      .replace(/^\[+\s*/gm, '')
      .replace(/\s*\]+$/gm, '')
      // Remove bold/italic markers but keep text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove headers
      .replace(/^#+\s+/gm, '')
      // Remove list markers
      .replace(/^[-*+]\s+/gm, '')
      // Clean up extra whitespace and newlines
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  };
  
  // Helper to extract text from markdown (remove syntax, keep text)
  const extractTextFromMarkdown = (md: string): string => {
    return cleanMarkdownForPreview(md);
  };
  
  const lines = displayContent.split('\n');
  let firstParagraphRaw = "";
  const MIN_PREVIEW_LENGTH = 150; // Minimum characters for a good preview
  const MAX_PARAGRAPHS = 5; // Maximum paragraphs to collect
  
  // Collect lines, skipping only images and empty lines at the start
  let collectedLines: string[] = [];
  let paragraphCount = 0;
  let foundFirstContent = false;
  let lastWasEmpty = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines at the very beginning (before any content)
    if (!foundFirstContent && !line) {
      continue;
    }
    
    // Skip only actual image markdown syntax (not regular links or text with URLs)
    const isImageOnly = line.match(/^!\[([^\]]*)\]\([^)]+\)$/) || 
                        line.match(/^\]\(https?:\/\/[^)]+\)$/) ||
                        (line.match(/^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?$/i));
    
    if (isImageOnly) {
      continue;
    }
    
    // Found first content line
    if (line && !foundFirstContent) {
      foundFirstContent = true;
    }
    
    if (line === "") {
      // Empty line - paragraph break
      if (collectedLines.length > 0 && !lastWasEmpty) {
        collectedLines.push("");
        paragraphCount++;
        lastWasEmpty = true;
        
        // Check if we have enough content
        const collectedText = extractTextFromMarkdown(collectedLines.join('\n'));
        if (collectedText.length >= MIN_PREVIEW_LENGTH && paragraphCount >= 2) {
          break;
        }
        
        // Stop if we've collected enough paragraphs
        if (paragraphCount >= MAX_PARAGRAPHS) {
          break;
        }
      }
      continue;
    }
    
    lastWasEmpty = false;
    // Add the line (all non-image lines)
    collectedLines.push(line);
  }
  
  firstParagraphRaw = collectedLines.join('\n').trim();
  
  // Fallback: if we didn't collect enough, take first 10 lines that aren't images
  if (!firstParagraphRaw || extractTextFromMarkdown(firstParagraphRaw).length < 50) {
    let fallbackLines: string[] = [];
    for (let i = 0; i < lines.length && fallbackLines.length < 10; i++) {
      const line = lines[i].trim();
      const isImageOnly = line.match(/^!\[([^\]]*)\]\([^)]+\)$/) || 
                          line.match(/^\]\(https?:\/\/[^)]+\)$/);
      if (line && !isImageOnly) {
        fallbackLines.push(line);
      }
    }
    if (fallbackLines.length > 0) {
      firstParagraphRaw = fallbackLines.join('\n');
    } else {
      firstParagraphRaw = displayContent.substring(0, 500).trim();
    }
  }
  
  // Clean the first paragraph to remove images for preview (but keep markdown structure)
  // Remove images but keep other markdown formatting
  const firstParagraph = firstParagraphRaw
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
    .replace(/\]\(https?:\/\/[^)]+\)/g, '') // Remove orphaned ](url) fragments
    .replace(/^\[+\s*/gm, '') // Remove leading brackets
    .replace(/\s*\]+$/gm, '') // Remove trailing brackets
    .replace(/\n{3,}/g, '\n\n') // Clean up excessive newlines
    .trim();
  
  // Check if there's more content after the first paragraph
  const firstParagraphIndex = displayContent.indexOf(firstParagraphRaw);
  const remainingContent = firstParagraphIndex >= 0 
    ? displayContent.substring(firstParagraphIndex + firstParagraphRaw.length).trim()
    : displayContent.substring(firstParagraphRaw.length).trim();
  const hasMoreContent = remainingContent.length > 0;

  // Determine platform name for "Read on..." link
  const platform = isBlogLink(url);
  const platformName = platform === 'substack' 
    ? 'Substack' 
    : platform === 'generic_article' 
    ? 'Article' 
    : 'Paragraph';

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
      {/* Cover Image */}
      {post.coverImage && (
        <div className="w-full overflow-hidden">
          <img
            src={post.coverImage}
            alt={post.title}
            className="w-full h-auto object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      <div className="p-4 sm:p-6">
        {/* Publication Info */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {post.publication.name || post.publication.slug}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {post.title}
        </h3>

        {/* Subtitle */}
        {post.subtitle && (
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4">
            {post.subtitle}
          </p>
        )}

        {/* Content Preview/Full */}
        <div className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
          {expanded ? (
            <div>
              {post.markdown ? (
                <MarkdownRenderer content={(() => {
                  let cleaned = post.markdown
                    // Remove image markdown ![alt](url) - handle multiline
                    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
                    // Remove orphaned image link fragments ](url)
                    .replace(/\]\(https?:\/\/[^)]+\)/g, '')
                    // Remove lines that are just brackets
                    .replace(/^\[+\s*$/gm, '')
                    .replace(/^\s*\]+$/gm, '')
                    // Remove orphaned brackets at start/end of lines
                    .replace(/^\[+\s*/gm, '')
                    .replace(/\s*\]+$/gm, '')
                    // Remove empty bracket lines
                    .replace(/^\s*\[\s*\]\s*$/gm, '')
                    // Clean up excessive whitespace
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                  
                  // Remove leading empty lines and image artifacts
                  cleaned = cleaned.split('\n')
                    .map(line => line.trim())
                    .filter((line, index, arr) => {
                      // Remove leading empty lines
                      if (index === 0 && line === '') return false;
                      // Remove lines that are just brackets or image fragments
                      if (line.match(/^\[+\s*$/) || line.match(/^\s*\]+$/)) return false;
                      return true;
                    })
                    .join('\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                  
                  return cleaned;
                })()} />
              ) : post.staticHtml ? (
                <div
                  className="prose prose-sm sm:prose-base dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: post.staticHtml }}
                />
              ) : (
                <div className="whitespace-pre-wrap">{displayContent}</div>
              )}
            </div>
          ) : (
            <div>
              {post.markdown ? (
                // For preview, use cleaned markdown without images
                firstParagraph ? (
                  <MarkdownRenderer content={firstParagraph} />
                ) : (
                  <p className="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                    {extractTextFromMarkdown(displayContent.substring(0, 200))}
                  </p>
                )
              ) : (
                <p className="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed">{firstParagraph}</p>
              )}
            </div>
          )}
        </div>

        {/* Expand/Collapse Button */}
        {hasMoreContent && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-4 flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Collapse Article
              </>
            ) : (
              <>
                Expand Article
                <ChevronDown className="w-4 h-4" />
              </>
            )}
          </button>
        )}

        {/* External Link */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          onClick={(e) => e.stopPropagation()}
        >
          Read on {platformName}
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}


