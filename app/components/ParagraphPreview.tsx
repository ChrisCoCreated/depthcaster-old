"use client";

import { useState, useEffect } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

interface ParagraphPost {
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

interface ParagraphPreviewProps {
  url: string;
}

export function ParagraphPreview({ url }: ParagraphPreviewProps) {
  const [post, setPost] = useState<ParagraphPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchPost = async () => {
      try {
        console.log('[ParagraphPreview] Fetching post for URL:', url);
        setLoading(true);
        setError(null);
        const apiUrl = `/api/paragraph?url=${encodeURIComponent(url)}`;
        console.log('[ParagraphPreview] API URL:', apiUrl);
        const response = await fetch(apiUrl);
        
        console.log('[ParagraphPreview] Response status:', response.status);
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[ParagraphPreview] Error response:', errorText);
          if (response.status === 404) {
            setError("Article not found");
          } else {
            setError("Failed to load article");
          }
          return;
        }

        const data = await response.json();
        console.log('[ParagraphPreview] Received post data:', data);
        setPost(data);
      } catch (err) {
        console.error("[ParagraphPreview] Error fetching Paragraph post:", err);
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
    return (
      <div className="my-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {error || "Unable to load article preview"}
        </div>
      </div>
    );
  }

  const displayContent = post.markdown || "";
  
  // Extract the first paragraph (everything up to the first double newline or end of content)
  const firstParagraphMatch = displayContent.match(/^([^\n]+(?:\n(?!\n)[^\n]+)*)/);
  const firstParagraph = firstParagraphMatch ? firstParagraphMatch[1].trim() : displayContent.split('\n')[0] || displayContent.substring(0, 500);
  
  // Check if there's more content after the first paragraph
  const remainingContent = firstParagraphMatch 
    ? displayContent.substring(firstParagraphMatch[0].length).trim()
    : displayContent.substring(firstParagraph.length).trim();
  const hasMoreContent = remainingContent.length > 0;

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
                <MarkdownRenderer content={post.markdown} />
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
                <MarkdownRenderer content={firstParagraph} />
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
          Read on Paragraph
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

