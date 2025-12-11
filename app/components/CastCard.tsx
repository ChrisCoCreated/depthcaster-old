"use client";

import { useState, useRef, useEffect, useMemo, type ReactElement } from "react";
import { Cast } from "@neynar/nodejs-sdk/build/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ImageModal } from "./ImageModal";
import { useNeynarContext } from "@neynar/react";
import { QuoteCastModal } from "./QuoteCastModal";
import { QualityFeedbackModal } from "./QualityFeedbackModal";
import { CastComposer } from "./CastComposer";
import { AutoLikeNotification } from "./AutoLikeNotification";
import { MessageCircle, Heart, Repeat2, Star, Share2, Tag, Trash2 } from "lucide-react";
import { shouldHideImages } from "./FeedSettings";
import { convertBaseAppLinksInline, isFarcasterLink, extractCastHashFromUrl } from "@/lib/link-converter";
import { calculateEngagementScore } from "@/lib/engagement";
import { AvatarImage } from "./AvatarImage";
import { analytics } from "@/lib/analytics";
import { hasActiveProSubscription } from "@/lib/castLimits";
import { VideoPlayer } from "./VideoPlayer";
import { CuratorBadge } from "./CuratorBadge";
import { DisplayMode } from "@/lib/customFeeds";
import { CollectionSelectModal } from "./CollectionSelectModal";
import { MentionedProfileCard } from "./MentionedProfileCard";
import { BlogPreview } from "./BlogPreview";
import { isBlogLink } from "@/lib/blog";

const CURATED_FEED_COLLAPSE_LINE_LIMIT = 8;

// Helper function to convert URLs in text to clickable links
function renderTextWithLinks(text: string, router: ReturnType<typeof useRouter>, insideLink: boolean = false, hideUrls: boolean = false) {
  // First, convert base.app links inline
  const textWithConvertedBaseLinks = convertBaseAppLinksInline(text);
  
  // Mention regex pattern - matches @username or @{username} format
  // Matches @{username} or @username (username can contain dots like base.base.eth)
  // For @username format, matches until whitespace, punctuation, or end of string
  // For @{username} format, matches the content inside braces
  const mentionRegexWithBraces = /@\{([a-zA-Z0-9_.-]+)\}/g;
  const mentionRegexWithoutBraces = /@([a-zA-Z0-9](?:[a-zA-Z0-9_.-]*[a-zA-Z0-9])?)(?=\s|$|[.,;:!?)\]])/g;
  
  // URL regex pattern - matches http(s):// URLs, www. URLs, domain-like patterns, and /cast/ paths
  const urlRegex = /(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"']+)|(\/cast\/0x[a-fA-F0-9]{8,})|([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.(?:[a-zA-Z]{2,})(?:\/[^\s<>"']*)?)/g;
  
  const parts: (string | ReactElement)[] = [];
  let lastIndex = 0;
  
  // First, process mentions with braces
  const mentionMatches: Array<{ index: number; length: number; username: string }> = [];
  let mentionMatch: RegExpExecArray | null;
  while ((mentionMatch = mentionRegexWithBraces.exec(textWithConvertedBaseLinks)) !== null) {
    const username = mentionMatch[1];
    if (!username) continue;
    
    mentionMatches.push({
      index: mentionMatch.index,
      length: mentionMatch[0].length,
      username: username,
    });
  }
  
  // Then process mentions without braces
  while ((mentionMatch = mentionRegexWithoutBraces.exec(textWithConvertedBaseLinks)) !== null) {
    // TypeScript doesn't narrow the type in while conditions, so we assert non-null here
    const match = mentionMatch;
    
    // Check if it's part of an email address (has alphanumeric before @)
    const beforeChar = match.index > 0 
      ? textWithConvertedBaseLinks[match.index - 1] 
      : '';
    // Skip if it looks like an email (has alphanumeric before @)
    if (/[a-zA-Z0-9]/.test(beforeChar)) {
      continue;
    }
    
    // Check if this mention overlaps with a brace mention
    const overlapsBraceMention = mentionMatches.some(m => {
      const mentionEnd = m.index + m.length;
      const matchEnd = match.index + match[0].length;
      return (match.index >= m.index && match.index < mentionEnd) ||
             (m.index >= match.index && m.index < matchEnd);
    });
    
    if (overlapsBraceMention) {
      continue;
    }
    
    const username = match[1];
    if (!username) continue;
    
    mentionMatches.push({
      index: match.index,
      length: match[0].length,
      username: username,
    });
  }
  
  // Then process URLs
  const urlMatches: Array<{ index: number; length: number; url: string; displayText: string }> = [];
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlRegex.exec(textWithConvertedBaseLinks)) !== null) {
    // TypeScript doesn't narrow the type in while conditions, so we assert non-null here
    const match = urlMatch;
    
    // Skip if it looks like an email address (has @ before it) or if it overlaps with a mention
    const beforeMatch = textWithConvertedBaseLinks.substring(Math.max(0, match.index - 50), match.index);
    if (beforeMatch.includes('@') && !beforeMatch.match(/@[\s\n]/)) {
      continue;
    }
    
    // Check if this URL overlaps with any mention
    const overlapsMention = mentionMatches.some(m => {
      const mentionEnd = m.index + m.length;
      const urlEnd = match.index + match[0].length;
      return (match.index >= m.index && match.index < mentionEnd) ||
             (m.index >= match.index && m.index < urlEnd);
    });
    
    if (overlapsMention) {
      continue;
    }
    
    let url = match[1] || match[2] || match[3] || match[4];
    urlMatches.push({
      index: match.index,
      length: match[0].length,
      url: url,
      displayText: match[0],
    });
  }
  
  // Merge and sort all matches by index
  const allMatches = [
    ...mentionMatches.map(m => ({ ...m, type: 'mention' as const })),
    ...urlMatches.map(m => ({ ...m, type: 'url' as const })),
  ].sort((a, b) => a.index - b.index);
  
  // Process all matches in order
  for (const match of allMatches) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(textWithConvertedBaseLinks.substring(lastIndex, match.index));
    }
    
    if (match.type === 'mention') {
      const mentionMatch = match as typeof match & { username: string };
      const username = mentionMatch.username;
      // Get the original text to preserve format (@username or @{username})
      const originalText = textWithConvertedBaseLinks.substring(match.index, match.index + match.length);
      const displayText = originalText;
      
      if (insideLink) {
        parts.push(
          <span
            key={match.index}
            className="text-blue-600 dark:text-blue-400 underline cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/profile/${encodeURIComponent(username)}`);
            }}
          >
            {displayText}
          </span>
        );
      } else {
        parts.push(
          <Link
            key={match.index}
            href={`/profile/${encodeURIComponent(username)}`}
            className="text-blue-600 dark:text-blue-400 underline"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              router.push(`/profile/${encodeURIComponent(username)}`);
            }}
          >
            {displayText}
          </Link>
        );
      }
    } else {
      const urlMatch = match as typeof match & { url: string; displayText: string };
      
      // If hideUrls is true, skip URL rendering
      if (hideUrls) {
        lastIndex = match.index + match.length;
        continue;
      }
      
      let url = urlMatch.url;
      let displayText = urlMatch.displayText;
      
      // If inside a link, render as span with click handler instead of <a> tag
      if (insideLink) {
        // Check if it's a Depthcaster link (already converted base.app link)
        if (url && url.startsWith('/cast/')) {
          parts.push(
            <span
              key={match.index}
              className="text-blue-600 dark:text-blue-400 hover:underline break-all cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(url);
              }}
            >
              {displayText}
            </span>
          );
        }
        // Handle external URLs
        else {
          // Ensure URL is absolute for external links
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }
          
          // Check if it's a Farcaster link (farcaster.xyz, warpcast.com) - convert on click
          if (isFarcasterLink(url)) {
            const hash = extractCastHashFromUrl(url);
            // Full cast hash is 0x + 64 hex chars = 66 chars total
            if (hash && hash.length === 66) {
              // Full hash found - convert directly
              parts.push(
                <span
                  key={match.index}
                  className="text-blue-600 dark:text-blue-400 hover:underline break-all cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/cast/${hash}`);
                  }}
                >
                  {displayText}
                </span>
              );
            } else {
              // Hash not found or truncated - resolve via API on click
              parts.push(
                <span
                  key={match.index}
                  className="text-blue-600 dark:text-blue-400 hover:underline break-all cursor-pointer"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      // Resolve the URL to get the cast hash
                      const response = await fetch(`/api/conversation?identifier=${encodeURIComponent(url)}&type=url&replyDepth=0`);
                      if (response.ok) {
                        const data = await response.json();
                        const castHash = data?.conversation?.cast?.hash;
                        if (castHash) {
                          router.push(`/cast/${castHash}`);
                        } else {
                          // Fallback to external link
                          window.open(url, '_blank');
                        }
                      } else {
                        // Fallback to external link on error
                        window.open(url, '_blank');
                      }
                    } catch (error) {
                      console.error('Failed to resolve Farcaster link:', error);
                      // Fallback to external link
                      window.open(url, '_blank');
                    }
                  }}
                >
                  {displayText}
                </span>
              );
            }
          }
          // Regular external link
          else {
            parts.push(
              <span
                key={match.index}
                className="text-blue-600 dark:text-blue-400 hover:underline break-all cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
              >
                {displayText}
              </span>
            );
          }
        }
      } else {
        // Not inside a link - render as normal <a> tags
        // Check if it's a Depthcaster link (already converted base.app link)
        if (url && url.startsWith('/cast/')) {
          parts.push(
            <Link
              key={match.index}
              href={url}
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {displayText}
            </Link>
          );
        }
        // Handle external URLs
        else {
          // Ensure URL is absolute for external links
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }
          
          // Check if it's a Farcaster link (farcaster.xyz, warpcast.com) - convert on click
          if (isFarcasterLink(url)) {
            const hash = extractCastHashFromUrl(url);
            // Full cast hash is 0x + 64 hex chars = 66 chars total
            if (hash && hash.length === 66) {
              // Full hash found - convert directly
              parts.push(
                <a
                  key={match.index}
                  href={`/cast/${hash}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/cast/${hash}`);
                  }}
                >
                  {displayText}
                </a>
              );
            } else {
              // Hash not found or truncated - resolve via API on click
              parts.push(
                <a
                  key={match.index}
                  href={url}
                  className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      // Resolve the URL to get the cast hash
                      const response = await fetch(`/api/conversation?identifier=${encodeURIComponent(url)}&type=url&replyDepth=0`);
                      if (response.ok) {
                        const data = await response.json();
                        const castHash = data?.conversation?.cast?.hash;
                        if (castHash) {
                          router.push(`/cast/${castHash}`);
                        } else {
                          // Fallback to external link
                          window.open(url, '_blank');
                        }
                      } else {
                        // Fallback to external link on error
                        window.open(url, '_blank');
                      }
                    } catch (error) {
                      console.error('Failed to resolve Farcaster link:', error);
                      // Fallback to external link
                      window.open(url, '_blank');
                    }
                  }}
                >
                  {displayText}
                </a>
              );
            }
          }
          // Regular external link
          else {
            parts.push(
              <a
                key={match.index}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                onClick={(e) => e.stopPropagation()}
              >
                {displayText}
              </a>
            );
          }
        }
      }
    }
    
    lastIndex = match.index + match.length;
  }
  
  // Add remaining text
  if (lastIndex < textWithConvertedBaseLinks.length) {
    parts.push(textWithConvertedBaseLinks.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : textWithConvertedBaseLinks;
}

interface MinimalReplyCardProps {
  reply: any;
  rootCast: Cast;
  compressedView?: boolean;
}

function MinimalReplyCard({ reply, rootCast, compressedView = true }: MinimalReplyCardProps) {
  return <ClusterReplyRow reply={reply} rootHash={rootCast?.hash} compressedView={compressedView} />;
}

interface ClusterReplyRowProps {
  reply: any;
  rootHash?: string;
  compressedView?: boolean;
}

function ClusterReplyRow({ reply, rootHash, compressedView = true }: ClusterReplyRowProps) {
  const replyAuthor = reply.author;
  const replyText = (reply.text || "").trim();
  const displayText = compressedView 
    ? (replyText.length > 220 ? `${replyText.slice(0, 220)}…` : replyText)
    : replyText;
  const replyHash = reply.hash;
  const href = replyHash && rootHash ? `/conversation/${rootHash}?replyHash=${replyHash}` : undefined;

  const content = (
    <div className="flex items-start gap-2">
      {replyAuthor && (
        <AvatarImage
          src={replyAuthor.pfp_url}
          alt={replyAuthor.display_name || replyAuthor.username || "User"}
          size={24}
          className="w-6 h-6 rounded-full flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {replyAuthor?.display_name || replyAuthor?.username || "Unknown"}
        </div>
        {displayText && (
          <p className={`text-sm text-gray-700 dark:text-gray-300 mt-0.5 ${compressedView ? 'line-clamp-2' : 'whitespace-pre-wrap break-words'}`}>
            {displayText}
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={(e) => e.stopPropagation()}
        className="block rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 px-1 py-1 transition-colors"
      >
        {content}
      </Link>
    );
  }

  return content;
}

function buildReplyClusters(replies: any[] = [], rootHash?: string) {
  if (!replies || replies.length === 0) {
    return [];
  }

  const repliesWithTimestamp = replies
    .filter(Boolean)
    .map((reply) => {
      const timestamp = new Date(
        reply._topReplyTimestamp || reply.timestamp || reply.created_at || Date.now()
      ).getTime();
      return {
        ...reply,
        _clusterTimestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
      };
    });

  const replyMap = new Map<string, any>();
  const childrenMap = new Map<string, any[]>();

  repliesWithTimestamp.forEach((reply) => {
    if (reply.hash) {
      replyMap.set(reply.hash, reply);
    }
    const parentHash = reply.parent_hash;
    if (parentHash) {
      if (!childrenMap.has(parentHash)) {
        childrenMap.set(parentHash, []);
      }
      childrenMap.get(parentHash)!.push(reply);
    }
  });

  childrenMap.forEach((children) => {
    children.sort(
      (a, b) => (a._clusterTimestamp ?? 0) - (b._clusterTimestamp ?? 0)
    );
  });

  const isRootReply = (reply: any) => {
    if (!reply.parent_hash) return true;
    if (rootHash && reply.parent_hash === rootHash) return true;
    return !replyMap.has(reply.parent_hash);
  };

  const seenRoots = new Set<string>();
  const rootReplies = repliesWithTimestamp.filter((reply) => {
    if (!isRootReply(reply)) return false;
    const key = reply.hash || `${reply.parent_hash || "root"}-${reply._clusterTimestamp}`;
    if (seenRoots.has(key)) return false;
    seenRoots.add(key);
    return true;
  });

  const clusters = rootReplies
    .map((root) => {
      const thread: any[] = [];
      const traverse = (node: any) => {
        thread.push(node);
        const children = childrenMap.get(node.hash) || [];
        children.forEach(traverse);
      };
      traverse(root);
      thread.sort(
        (a, b) => (a._clusterTimestamp ?? 0) - (b._clusterTimestamp ?? 0)
      );
      const latestReply = thread.reduce((latest, current) => {
        if (!latest) return current;
        return (current._clusterTimestamp ?? 0) >= (latest._clusterTimestamp ?? 0)
          ? current
          : latest;
      }, null as any);

      return {
        id: root.hash || `${root.parent_hash || "cluster"}-${root._clusterTimestamp}`,
        displayName: root.author?.display_name || root.author?.username || "Unknown",
        replies: thread,
        latestTimestamp: latestReply?._clusterTimestamp ?? root._clusterTimestamp ?? 0,
        latestReplyHash: latestReply?.hash || root.hash,
        rootReplyHash: root.hash,
      };
    })
    .filter((cluster) => cluster.replies.length > 0);

  clusters.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  return clusters.slice(0, 3);
}

function buildClusterPreview(replies: any[]) {
  if (replies.length <= 5) {
    return replies.map((reply) => ({ type: "reply", reply }));
  }

  return [
    { type: "reply", reply: replies[0] },
    { type: "reply", reply: replies[1] },
    { type: "gap" },
    { type: "reply", reply: replies[replies.length - 2] },
    { type: "reply", reply: replies[replies.length - 1] },
  ];
}

interface DynamicImageGridProps {
  embeds: any[];
  indices: number[];
  embedMetadata: Map<string, { title: string | null; description: string | null; image: string | null; author_name?: string | null; author_url?: string | null }>;
  onImageClick: (url: string) => void;
}

function DynamicImageGrid({ embeds, indices, embedMetadata, onImageClick }: DynamicImageGridProps) {
  const [imageDimensions, setImageDimensions] = useState<Array<{ width: number; height: number; url: string; linkUrl: string } | null>>(
    embeds.map(() => null)
  );

  // Extract image URLs from embeds
  const extractImageUrl = (embed: any): { imageUrl: string | null; linkUrl: string } => {
    let imageUrl = embed.url;
    const linkUrl = embed.url;
    
    // Check if this is an X/Twitter link
    let isXEmbed = false;
    try {
      if (embed.url) {
        const urlObj = new URL(embed.url);
        isXEmbed = urlObj.hostname === 'x.com' || urlObj.hostname === 'twitter.com' || urlObj.hostname === 'www.twitter.com' || urlObj.hostname === 'www.x.com';
      }
    } catch {
      // Invalid URL, skip
    }
    
    if (embed.metadata) {
      const metadata = embed.metadata;
      if (metadata.image || (metadata.content_type && metadata.content_type.startsWith('image/'))) {
        imageUrl = embed.url;
        // Check if it's a Twitter emoji SVG (only for X/Twitter links)
        if (isXEmbed && imageUrl && (imageUrl.includes('twimg.com/emoji') || imageUrl.includes('/svg/'))) {
          imageUrl = null;
        }
      } else {
        if (metadata.html?.ogImage) {
          const ogImages = Array.isArray(metadata.html.ogImage) ? metadata.html.ogImage : [metadata.html.ogImage];
          const nonEmojiImage = ogImages.find((img: any) => {
            if (!img.url) return false;
            if (img.type === 'svg') return false;
            // Only filter emoji for X/Twitter links
            if (isXEmbed && (img.url.includes('twimg.com/emoji') || img.url.includes('/svg/'))) return false;
            return true;
          });
          if (nonEmojiImage) imageUrl = nonEmojiImage.url;
        }
        if (!imageUrl && metadata.image) {
          const img = typeof metadata.image === 'string' ? metadata.image : metadata.image?.url || null;
          // Filter out Twitter emoji SVGs (only for X/Twitter links)
          if (img && (!isXEmbed || (!img.includes('twimg.com/emoji') && !img.includes('/svg/')))) {
            imageUrl = img;
          }
        }
        if (!imageUrl && metadata.ogImage) {
          const ogImg = Array.isArray(metadata.ogImage) ? metadata.ogImage[0] : metadata.ogImage;
          const img = typeof ogImg === 'string' ? ogImg : ogImg?.url || null;
          // Filter out Twitter emoji SVGs (only for X/Twitter links)
          if (img && (!isXEmbed || (!img.includes('twimg.com/emoji') && !img.includes('/svg/')))) {
            imageUrl = img;
          }
        }
        if (!imageUrl) {
          const fetchedMeta = embedMetadata.get(embed.url);
          if (fetchedMeta?.image) {
            imageUrl = fetchedMeta.image;
          }
        }
      }
    }
    
    // Final check: filter out Twitter emoji SVGs (only for X/Twitter links)
    if (isXEmbed && imageUrl && (imageUrl.includes('twimg.com/emoji') || imageUrl.includes('/svg/'))) {
      imageUrl = null;
    }
    
    return { imageUrl, linkUrl };
  };

  // Load images and get dimensions
  useEffect(() => {
    const loadDimensions = async () => {
      const dimensions = await Promise.all(
        embeds.map(async (embed) => {
          const { imageUrl, linkUrl } = extractImageUrl(embed);
          if (!imageUrl) return null;

          return new Promise<{ width: number; height: number; url: string; linkUrl: string } | null>((resolve) => {
            const img = new Image();
            img.onload = () => {
              resolve({ width: img.naturalWidth, height: img.naturalHeight, url: imageUrl, linkUrl });
            };
            img.onerror = () => resolve(null);
            img.src = imageUrl;
          });
        })
      );

      setImageDimensions(dimensions);
    };

    loadDimensions();
  }, [embeds, embedMetadata]);

  // Calculate optimal layout based on image dimensions
  const calculateLayout = (dimensions: Array<{ width: number; height: number; url: string; linkUrl: string } | null>) => {
    const validDims = dimensions.filter((d): d is { width: number; height: number; url: string; linkUrl: string } => d !== null);
    const count = validDims.length;

    if (count === 0) return { cols: 6, rows: 6, spans: [] };

    // Calculate aspect ratios
    const aspectRatios = validDims.map(d => d.width / d.height);
    const isPortrait = (ratio: number) => ratio < 1;
    const isLandscape = (ratio: number) => ratio > 1.3;
    const isSquare = (ratio: number) => ratio >= 0.9 && ratio <= 1.1;

    // Using 6x6 grid (2:1 container ratio)
    const cols = 6;
    const rows = 6;

    if (count === 1) {
      return { cols, rows, spans: [{ col: 6, row: 6 }] };
    }

    if (count === 2) {
      const [r1, r2] = aspectRatios;
      const p1 = isPortrait(r1);
      const p2 = isPortrait(r2);
      const l1 = isLandscape(r1);
      const l2 = isLandscape(r2);
      
      // Both portraits: side by side
      if (p1 && p2) {
        return { cols, rows, spans: [{ col: 3, row: 6 }, { col: 3, row: 6 }] };
      }
      // Both landscape: stack vertically
      if (l1 && l2) {
        return { cols, rows, spans: [{ col: 6, row: 3 }, { col: 6, row: 3 }] };
      }
      // Mixed: optimize based on which is portrait/landscape
      // Portrait + Landscape: portrait takes less width, landscape takes more
      if (p1 && l2) {
        return { cols, rows, spans: [{ col: 2, row: 6 }, { col: 4, row: 6 }] };
      }
      if (l1 && p2) {
        return { cols, rows, spans: [{ col: 4, row: 6 }, { col: 2, row: 6 }] };
      }
      // Both square or mixed: equal split
      return { cols, rows, spans: [{ col: 3, row: 6 }, { col: 3, row: 6 }] };
    }

    if (count === 3) {
      const portraitCount = aspectRatios.filter(r => isPortrait(r)).length;
      const landscapeCount = aspectRatios.filter(r => isLandscape(r)).length;
      
      // If all portraits, side by side
      if (portraitCount === 3) {
        return { cols, rows, spans: [{ col: 2, row: 6 }, { col: 2, row: 6 }, { col: 2, row: 6 }] };
      }
      // If all landscape, stack
      if (landscapeCount === 3) {
        return { cols, rows, spans: [{ col: 6, row: 2 }, { col: 6, row: 2 }, { col: 6, row: 2 }] };
      }
      // Mixed: optimize based on aspect ratios
      // 2 portraits + 1 landscape: portraits narrower side by side, landscape full width below
      if (portraitCount === 2) {
        const landscapeIdx = aspectRatios.findIndex(r => isLandscape(r));
        const spans: Array<{ col: number; row: number }> = [];
        let portraitIdx = 0;
        for (let i = 0; i < 3; i++) {
          if (i === landscapeIdx) {
            spans.push({ col: 6, row: 3 }); // Landscape gets full width
          } else {
            spans.push({ col: 3, row: 3 }); // Portraits share top row
          }
        }
        return { cols, rows, spans };
      }
      // 1 portrait + 2 landscape: portrait narrow on left, landscapes wider on right
      if (portraitCount === 1) {
        const portraitIdx = aspectRatios.findIndex(r => isPortrait(r));
        const spans: Array<{ col: number; row: number }> = [];
        for (let i = 0; i < 3; i++) {
          if (i === portraitIdx) {
            spans.push({ col: 2, row: 6 }); // Portrait narrow, full height
          } else {
            spans.push({ col: 4, row: 3 }); // Landscapes wider, stacked
          }
        }
        return { cols, rows, spans };
      }
      // Fallback: balanced layout
      return { cols, rows, spans: [{ col: 2, row: 6 }, { col: 2, row: 6 }, { col: 2, row: 6 }] };
    }

    if (count === 4) {
      const portraitCount = aspectRatios.filter(r => isPortrait(r)).length;
      const landscapeCount = aspectRatios.filter(r => isLandscape(r)).length;
      
      // If mostly portraits (3+), use 2x2 grid
      if (portraitCount >= 3) {
        return {
          cols,
          rows,
          spans: [
            { col: 3, row: 3 },
            { col: 3, row: 3 },
            { col: 3, row: 3 },
            { col: 3, row: 3 }
          ]
        };
      }
      // If mostly landscape (3+), optimize for wider images
      if (landscapeCount >= 3) {
        // Top row: 2 landscapes side by side (wider)
        // Bottom row: 2 landscapes side by side (wider)
        return {
          cols,
          rows,
          spans: [
            { col: 3, row: 3 },
            { col: 3, row: 3 },
            { col: 3, row: 3 },
            { col: 3, row: 3 }
          ]
        };
      }
      // Mixed: 2 portraits + 2 landscapes
      // Arrange: portrait + landscape on top row, portrait + landscape on bottom row
      if (portraitCount === 2 && landscapeCount === 2) {
        // Build spans array in order of images
        const spans: Array<{ col: number; row: number }> = [];
        aspectRatios.forEach((r) => {
          if (isPortrait(r)) {
            spans.push({ col: 2, row: 3 }); // Portraits narrower
          } else if (isLandscape(r)) {
            spans.push({ col: 4, row: 3 }); // Landscapes wider
          } else {
            spans.push({ col: 3, row: 3 }); // Squares/default
          }
        });
        
        return { cols, rows, spans };
      }
      // Default: 2x2 grid
      return {
        cols,
        rows,
        spans: [
          { col: 3, row: 3 },
          { col: 3, row: 3 },
          { col: 3, row: 3 },
          { col: 3, row: 3 }
        ]
      };
    }

    // For 5+ images, use a balanced grid
    const spans: Array<{ col: number; row: number }> = [];
    let remaining = count;
    let currentRow = 0;

    while (remaining > 0 && currentRow < rows) {
      if (remaining >= 3) {
        spans.push({ col: 2, row: 2 }, { col: 2, row: 2 }, { col: 2, row: 2 });
        remaining -= 3;
        currentRow += 2;
      } else if (remaining === 2) {
        spans.push({ col: 3, row: 2 }, { col: 3, row: 2 });
        remaining -= 2;
        currentRow += 2;
      } else {
        spans.push({ col: 6, row: 2 });
        remaining -= 1;
        currentRow += 2;
      }
    }

    return { cols, rows, spans: spans.slice(0, count) };
  };

  const layout = calculateLayout(imageDimensions);
  const imageData = embeds.map((embed, idx) => {
    const dims = imageDimensions[idx];
    const { imageUrl, linkUrl } = extractImageUrl(embed);
    return { imageUrl, linkUrl, dimensions: dims };
  });

  return (
    <div
      className="w-full aspect-[2/1] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        gap: '2px'
      }}
    >
      {imageData.map((data, imgIndex) => {
        if (!data.imageUrl) return null;
        const span = layout.spans[imgIndex] || { col: 2, row: 3 };

        return (
          <a
            key={indices[imgIndex]}
            href={data.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden bg-gray-100 dark:bg-gray-800 relative flex items-center justify-center"
            style={{
              gridColumn: `span ${span.col}`,
              gridRow: `span ${span.row}`
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onImageClick(data.imageUrl!);
            }}
          >
            <img
              src={data.imageUrl}
              alt="Embedded image"
              className="max-w-full max-h-full w-auto h-auto cursor-pointer hover:opacity-90 transition-opacity"
              style={{
                objectFit: 'contain'
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </a>
        );
      })}
    </div>
  );
}

interface CastCardProps {
  cast: Cast & { 
    _curatorFid?: number; 
    _curatorInfo?: { fid: number; username?: string; display_name?: string; pfp_url?: string };
    _topReplies?: any[];
    _repliesUpdatedAt?: Date | string;
    _parentCast?: Cast; // Parent cast for quote casts that are not root
  };
  showThread?: boolean;
  showTopReplies?: boolean;
  onUpdate?: () => void;
  feedType?: string; // 'curated' or other feed types
  isReply?: boolean; // Whether this is a reply (for delete functionality)
  curatorInfo?: { fid: number; username?: string; display_name?: string; pfp_url?: string };
  sortBy?: "recently-curated" | "time-of-cast" | "recent-reply" | "quality";
  disableClick?: boolean; // Disable click navigation (e.g., when in conversation view)
  rootCastHash?: string; // Root cast hash for the current page/view
  compressedView?: boolean; // Whether to show compressed view (collapsed text)
  displayMode?: DisplayMode; // Custom display mode for embeds/links
}

export function CastCard({ cast, showThread = false, showTopReplies = true, onUpdate, feedType, curatorInfo, sortBy, isReply = false, disableClick = false, rootCastHash, compressedView = false, displayMode }: CastCardProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showRecastMenu, setShowRecastMenu] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [isLiked, setIsLiked] = useState(cast.viewer_context?.liked || false);
  const [isRecasted, setIsRecasted] = useState(cast.viewer_context?.recasted || false);
  const [likesCount, setLikesCount] = useState(cast.reactions?.likes_count || 0);
  const [recastsCount, setRecastsCount] = useState(cast.reactions?.recasts_count || 0);
  
  // Extract link URL for display mode button
  const displayModeLinkUrl = displayMode?.replaceEmbeds && cast.embeds && cast.embeds.length > 0
    ? ((cast.embeds[0] as any)?.url || cast.parent_url)
    : null;
  const [isReacting, setIsReacting] = useState(false);
  const [isCurating, setIsCurating] = useState(false);
  const [isCurated, setIsCurated] = useState(false);
  const [curators, setCurators] = useState<Array<{ fid: number; username?: string; display_name?: string; pfp_url?: string }>>([]);
  const [showUncurateConfirm, setShowUncurateConfirm] = useState(false);
  const [showCollectionSelectModal, setShowCollectionSelectModal] = useState(false);
  const [topReplies, setTopReplies] = useState<any[]>(cast._topReplies || []);
  const [hasAnyReplies, setHasAnyReplies] = useState<boolean | undefined>(undefined);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesLoaded, setRepliesLoaded] = useState(!!cast._topReplies?.length);
  const [replySortBy, setReplySortBy] = useState<"recent-reply" | "highest-quality-replies" | "highest-engagement">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("replySortBy");
      if (saved === "recent-reply" || saved === "highest-quality-replies" || saved === "highest-engagement") {
        return saved;
      }
    }
    return "highest-quality-replies"; // Default to highest quality replies
  });
  const [showReplySortMenu, setShowReplySortMenu] = useState(false);
  const [replyMinQuality, setReplyMinQuality] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("replyMinQuality");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && [20, 50, 60, 70].includes(parsed)) {
          return parsed;
        }
      }
    }
    return 60; // Default to 60+ quality
  });
  const [embedMetadata, setEmbedMetadata] = useState<Map<string, { title: string | null; description: string | null; image: string | null; author_name?: string | null; author_url?: string | null }>>(new Map());
  const fetchedUrlsRef = useRef<Set<string>>(new Set());
  const recastMenuRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const castCardRef = useRef<HTMLDivElement>(null);
  const { user } = useNeynarContext();
  const router = useRouter();
  const [preferencesVersion, setPreferencesVersion] = useState(0);
  const [isAuthorCurator, setIsAuthorCurator] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [isTagging, setIsTagging] = useState(false);
  const [showAutoLikeNotification, setShowAutoLikeNotification] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCuratedCastExpanded, setIsCuratedCastExpanded] = useState(false);
  const [showQualityFeedbackModal, setShowQualityFeedbackModal] = useState(false);
  const [showCurateFirstMessage, setShowCurateFirstMessage] = useState(false);
  const [isQualityScoreHovered, setIsQualityScoreHovered] = useState(false);
  const [hasCuratedRootCast, setHasCuratedRootCast] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const [localCompressedView, setLocalCompressedView] = useState(compressedView);
  
  const author = cast.author;
  
  // Listen for preference changes
  useEffect(() => {
    const handlePreferencesChange = () => {
      if (feedType === "curated") {
        const saved = localStorage.getItem("curatedFeedCompressedView");
        setLocalCompressedView(saved === "true");
      }
    };
    window.addEventListener("feedPreferencesChanged", handlePreferencesChange);
    return () => {
      window.removeEventListener("feedPreferencesChanged", handlePreferencesChange);
    };
  }, [feedType]);
  
  // Update when prop changes
  useEffect(() => {
    setLocalCompressedView(compressedView);
  }, [compressedView]);

  const castTextLines = useMemo(() => {
    const textToUse = translatedText || cast.text || "";
    return textToUse ? textToUse.split(/\r?\n/) : [];
  }, [translatedText, cast.text]);
  const shouldCollapseCuratedCastText = useMemo(() => {
    if (!localCompressedView || castTextLines.length <= CURATED_FEED_COLLAPSE_LINE_LIMIT) {
      return false;
    }
    
    // Calculate how many lines would be hidden
    const topCount = Math.ceil(CURATED_FEED_COLLAPSE_LINE_LIMIT / 2);
    const bottomCount = CURATED_FEED_COLLAPSE_LINE_LIMIT - topCount;
    const hiddenCount = Math.max(castTextLines.length - (topCount + bottomCount), 0);
    
    // Only collapse if at least 6 lines would be hidden
    return hiddenCount >= 6;
  }, [localCompressedView, castTextLines.length]);
  const collapsedCuratedCastSegments = useMemo(() => {
    if (!shouldCollapseCuratedCastText) {
      return null;
    }

    const topCount = Math.ceil(CURATED_FEED_COLLAPSE_LINE_LIMIT / 2);
    const bottomCount = CURATED_FEED_COLLAPSE_LINE_LIMIT - topCount;
    const topLines = castTextLines.slice(0, topCount);
    const bottomLines = bottomCount > 0 ? castTextLines.slice(-bottomCount) : [];
    const hiddenCount = Math.max(castTextLines.length - (topLines.length + bottomLines.length), 0);

    return {
      topText: topLines.join("\n"),
      bottomText: bottomLines.join("\n"),
      hiddenCount,
    };
  }, [shouldCollapseCuratedCastText, castTextLines]);

  // Track cast view and conversation view
  useEffect(() => {
    if (cast.hash && cast.author?.fid) {
      if (showThread) {
        analytics.trackConversationView(cast.hash, cast.author.fid);
      } else {
        analytics.trackCastView(cast.hash, cast.author.fid, feedType);
        // Also track to database
        const trackCastViewToDB = async () => {
          try {
            await fetch("/api/analytics/cast-view", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                castHash: cast.hash,
                authorFid: cast.author.fid,
                feedType: feedType || null,
                userFid: user?.fid || null,
              }),
            });
          } catch (error) {
            // Silently fail - analytics shouldn't break the app
            console.error("Failed to track cast view:", error);
          }
        };
        trackCastViewToDB();
      }
    }
  }, [cast.hash, cast.author?.fid, showThread, feedType, user?.fid]);

  // Listen for preference changes to trigger re-render
  useEffect(() => {
    const handlePreferencesChange = () => {
      setPreferencesVersion((v) => v + 1);
    };
    window.addEventListener("feedPreferencesChanged", handlePreferencesChange);
    return () => {
      window.removeEventListener("feedPreferencesChanged", handlePreferencesChange);
    };
  }, []);

  // Fetch metadata for embeds that don't have it
  useEffect(() => {
    if (!cast.embeds) {
      return;
    }

    const fetchMetadataForEmbeds = async () => {
      const urlsToFetch: string[] = [];

      cast.embeds.forEach((embed: any, index: number) => {
        if (embed.url) {
          const metadata = embed.metadata;
          const urlObj = new URL(embed.url);
          const isXEmbed = urlObj.hostname === 'x.com' || urlObj.hostname === 'twitter.com' || urlObj.hostname === 'www.twitter.com' || urlObj.hostname === 'www.x.com';
          const hasMetadata = metadata?.html || metadata?.title || metadata?.description || metadata?.image || metadata?.ogImage;
          
          // For Twitter/X, check if we have oEmbed but missing thumbnail
          const hasOEmbed = metadata?.html?.oembed;
          const ogImages = metadata?.html?.ogImage;
          const isTwitterEmoji = (url: string) => {
            return url.includes('twimg.com/emoji') || url.includes('/svg/');
          };
          const hasRealImage = ogImages && Array.isArray(ogImages) && ogImages.some((img: any) => {
            if (!img.url) return false;
            if (img.type === 'svg') return false;
            if (isTwitterEmoji(img.url)) return false;
            return true;
          });
          const needsThumbnail = isXEmbed && hasOEmbed && !hasRealImage;
          
          // Only fetch if we don't have metadata and it's a link (not an image)
          // OR if it's Twitter/X with oEmbed but missing thumbnail
          // Also check if we've already fetched metadata for this URL
          if ((!hasMetadata || needsThumbnail) && !metadata?.image && !(metadata?.content_type && metadata.content_type.startsWith('image/'))) {
            // Check if we already have fetched metadata for this URL
            if (!fetchedUrlsRef.current.has(embed.url)) {
              urlsToFetch.push(embed.url);
              fetchedUrlsRef.current.add(embed.url);
            }
          }
        }
      });

      if (urlsToFetch.length === 0) {
        return;
      }

      // Fetch metadata for all URLs in parallel
      const metadataPromises = urlsToFetch.map(async (url) => {
        try {
          const apiUrl = `/api/metadata?url=${encodeURIComponent(url)}`;
          const response = await fetch(apiUrl);
          if (response.ok) {
            const data = await response.json();
            return { url, metadata: data };
          }
        } catch (error) {
          // Silently fail - metadata fetch is optional
        }
        return null;
      });

      const results = await Promise.all(metadataPromises);
      
      setEmbedMetadata((prevMetadata) => {
        const newMetadata = new Map(prevMetadata);
        
        results.forEach((result) => {
          if (result && result.metadata && !newMetadata.has(result.url)) {
            newMetadata.set(result.url, {
              title: result.metadata.title || null,
              description: result.metadata.description || null,
              image: result.metadata.image || null,
              author_name: result.metadata.author_name || null,
              author_url: result.metadata.author_url || null,
            });
          }
        });

        return newMetadata;
      });
    };

    fetchMetadataForEmbeds();
  }, [cast.embeds]);

  const replyClusters = useMemo(
    () => buildReplyClusters(topReplies, cast.hash),
    [topReplies, cast.hash]
  );

  // Sync top replies when cast prop changes
  useEffect(() => {
    if (cast._topReplies && cast._topReplies.length > 0) {
      setTopReplies(cast._topReplies);
      setRepliesLoaded(true);
    }
  }, [cast._topReplies]);

  // Check if author is curator
  useEffect(() => {
    const checkAuthorCuratorStatus = async () => {
      if (!author?.fid) return;
      try {
        const response = await fetch(`/api/admin/check?fid=${author.fid}`);
        if (response.ok) {
          const data = await response.json();
          const roles = data.roles || [];
          setIsAuthorCurator(roles.includes("curator"));
        }
      } catch (error) {
        console.error("Failed to check curator status:", error);
      }
    };

    checkAuthorCuratorStatus();
  }, [author?.fid]);

  // Lazy load replies when cast comes into viewport
  useEffect(() => {
    // Skip if replies already loaded or not in curated feed
    if (repliesLoaded || !cast.hash || (feedType !== "curated" && !cast._curatorFid)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !repliesLoaded && !repliesLoading) {
            // Load replies when cast comes into viewport
            setRepliesLoading(true);
            const params = new URLSearchParams({
              castHash: cast.hash!,
              sortBy: replySortBy,
              minQualityScore: replyMinQuality.toString(),
            });
            if (user?.fid) {
              params.append("viewerFid", user.fid.toString());
            }

            fetch(`/api/feed/replies?${params}`)
              .then((res) => res.json())
              .then((data) => {
                if (data.replies) {
                  setTopReplies(data.replies);
                  setHasAnyReplies(data.hasAnyReplies !== undefined ? data.hasAnyReplies : true);
                  setRepliesLoaded(true);
                }
              })
              .catch((error) => {
                console.error("Error loading replies:", error);
              })
              .finally(() => {
                setRepliesLoading(false);
              });
          }
        });
      },
      {
        rootMargin: "200px", // Start loading 200px before cast enters viewport
      }
    );

    const currentRef = castCardRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [cast.hash, repliesLoaded, repliesLoading, feedType, cast._curatorFid, replySortBy, replyMinQuality, user?.fid]);

  // Listen for reply filter changes from other cast cards to keep them in sync
  useEffect(() => {
    const handleReplyFilterChange = () => {
      const saved = localStorage.getItem("replyMinQuality");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && [20, 50, 60, 70].includes(parsed) && parsed !== replyMinQuality) {
          setReplyMinQuality(parsed);
        }
      }
    };

    window.addEventListener("replyFilterChanged", handleReplyFilterChange);
    return () => {
      window.removeEventListener("replyFilterChanged", handleReplyFilterChange);
    };
  }, [replyMinQuality]);

  // Refetch replies when replySortBy or replyMinQuality changes
  useEffect(() => {
    if (repliesLoaded && cast.hash && (feedType === "curated" || cast._curatorFid)) {
      setRepliesLoading(true);
      const params = new URLSearchParams({
        castHash: cast.hash!,
        sortBy: replySortBy,
        minQualityScore: replyMinQuality.toString(),
      });
      if (user?.fid) {
        params.append("viewerFid", user.fid.toString());
      }

      fetch(`/api/feed/replies?${params}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.replies) {
            setTopReplies(data.replies);
            setHasAnyReplies(data.hasAnyReplies !== undefined ? data.hasAnyReplies : true);
          }
        })
        .catch((error) => {
          console.error("Error loading replies:", error);
        })
        .finally(() => {
          setRepliesLoading(false);
        });
    }
  }, [replySortBy, replyMinQuality, cast.hash, feedType, cast._curatorFid, user?.fid, repliesLoaded]);

  // Check if cast is already curated on mount (check regardless of user login status)
  useEffect(() => {
    if (!cast.hash) {
      return;
    }

    const checkIfCurated = async () => {
      try {
        const response = await fetch(`/api/curate?castHash=${cast.hash}`);
        if (response.ok) {
          const data = await response.json();
          if (data.isCurated) {
            setIsCurated(true);
            // Use curators in chronological order (oldest first) from API
            setCurators(data.curatorInfo || []);
          } else {
            setIsCurated(false);
            setCurators([]);
          }
        }
      } catch (error) {
        // Silently fail - cast is not curated
        setIsCurated(false);
        setCurators([]);
      }
    };

    checkIfCurated();
  }, [cast.hash, user?.fid]);

  // Check if user has curated the root cast (for replies)
  useEffect(() => {
    if (!rootCastHash || !user?.fid || !cast.hash) {
      setHasCuratedRootCast(false);
      return;
    }

    // Only check if this is a reply and rootCastHash is different from current cast hash
    if (rootCastHash === cast.hash) {
      setHasCuratedRootCast(false);
      return;
    }

    const checkRootCastCuration = async () => {
      try {
        const response = await fetch(`/api/curate?castHash=${rootCastHash}`);
        if (response.ok) {
          const data = await response.json();
          const hasCurated = data.curatorFids?.includes(user.fid) || false;
          setHasCuratedRootCast(hasCurated);
        } else {
          setHasCuratedRootCast(false);
        }
      } catch (error) {
        setHasCuratedRootCast(false);
      }
    };

    checkRootCastCuration();
  }, [rootCastHash, user?.fid, cast.hash]);

  // Check if user is admin and fetch tags
  useEffect(() => {
    if (!user?.fid || !cast.hash) {
      return;
    }

    const checkAdminAndFetchTags = async () => {
      try {
        // Check admin status
        const adminResponse = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (adminResponse.ok) {
          const adminData = await adminResponse.json();
          setIsAdmin(adminData.isAdmin || false);
          setIsSuperAdmin(adminData.isSuperAdmin || false);
        }

        // Fetch tags
        const tagsResponse = await fetch(`/api/tags?castHash=${cast.hash}`);
        if (tagsResponse.ok) {
          const tagsData = await tagsResponse.json();
          setTags(tagsData.tags?.map((t: any) => t.tag) || []);
        }
      } catch (error) {
        console.error("Failed to check admin status or fetch tags:", error);
      }
    };

    checkAdminAndFetchTags();
  }, [user?.fid, cast.hash]);

  // Prevent body scroll when confirmation modal is open
  useEffect(() => {
    if (showUncurateConfirm || showDeleteConfirm) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showUncurateConfirm, showDeleteConfirm]);

  // Close recast menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (recastMenuRef.current && !recastMenuRef.current.contains(event.target as Node)) {
        setShowRecastMenu(false);
      }
    };

    if (showRecastMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showRecastMenu]);

  // Close share menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(event.target as Node)) {
        setShowShareMenu(false);
      }
    };

    if (showShareMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showShareMenu]);

  // Close tag menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(event.target as Node)) {
        setShowTagMenu(false);
      }
    };

    if (showTagMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTagMenu]);

  // Close reply sort menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const menuElement = document.querySelector('[data-reply-sort-menu]');
      const buttonElement = document.querySelector('[data-reply-sort-button]');
      if (menuElement && !menuElement.contains(target) && buttonElement && !buttonElement.contains(target)) {
        setShowReplySortMenu(false);
      }
    };
    if (showReplySortMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showReplySortMenu]);

  const handleLike = async () => {
    if (!user?.signer_uuid) {
      alert("Please sign in to like casts");
      return;
    }

    try {
      setIsReacting(true);
      const wasLiked = isLiked;
      const newLikesCount = wasLiked ? likesCount - 1 : likesCount + 1;
      
      // Optimistic update
      setIsLiked(!wasLiked);
      setLikesCount(newLikesCount);

      const requestBody = {
        signerUuid: user.signer_uuid,
        reactionType: "like",
        target: cast.hash,
        targetAuthorFid: cast.author.fid,
      };

      const response = await fetch("/api/reaction", {
        method: wasLiked ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        // Revert optimistic update on error
        setIsLiked(wasLiked);
        setLikesCount(likesCount);
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to toggle like");
      }

      // Track analytics
      if (wasLiked) {
        analytics.trackCastUnlike(cast.hash, cast.author.fid, feedType);
      } else {
        analytics.trackCastLike(cast.hash, cast.author.fid, feedType);
      }
    } catch (error: any) {
      console.error("Like error:", error);
      alert(error.message || "Failed to toggle like");
    } finally {
      setIsReacting(false);
    }
  };

  const handleRecast = async () => {
    if (!user?.signer_uuid) {
      alert("Please sign in to recast");
      return;
    }

    try {
      setIsReacting(true);
      setShowRecastMenu(false);
      const wasRecasted = isRecasted;
      const newRecastsCount = wasRecasted ? recastsCount - 1 : recastsCount + 1;
      
      // Optimistic update
      setIsRecasted(!wasRecasted);
      setRecastsCount(newRecastsCount);

      const response = await fetch("/api/reaction", {
        method: wasRecasted ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          signerUuid: user.signer_uuid,
          reactionType: "recast",
          target: cast.hash,
          targetAuthorFid: cast.author.fid,
        }),
      });

      if (!response.ok) {
        // Revert optimistic update on error
        setIsRecasted(wasRecasted);
        setRecastsCount(recastsCount);
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to toggle recast");
      }

      // Track analytics
      if (wasRecasted) {
        analytics.trackCastUnrecast(cast.hash, cast.author.fid, feedType);
      } else {
        analytics.trackCastRecast(cast.hash, cast.author.fid, feedType);
      }

      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      console.error("Recast error:", error);
      alert(error.message || "Failed to toggle recast");
    } finally {
      setIsReacting(false);
    }
  };

  const handleQuote = () => {
    if (!user?.signer_uuid) {
      alert("Please sign in to quote casts");
      return;
    }
    setShowRecastMenu(false);
    setShowQuoteModal(true);
    analytics.trackCastQuote(cast.hash, cast.author.fid, feedType);
  };

  const handleOpenInFarcaster = () => {
    if (cast.hash) {
      window.open(`https://warpcast.com/~/conversations/${cast.hash}`, '_blank');
    }
    setShowShareMenu(false);
  };

  const handleCopyText = async () => {
    const textToCopy = translatedText || cast.text || '';
    try {
      await navigator.clipboard.writeText(textToCopy);
      setShowShareMenu(false);
      // Optionally show a toast notification
    } catch (error) {
      console.error('Failed to copy text:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      // Check if element still has a parent before removing (prevents errors in Strict Mode)
      if (textArea.parentNode) {
        document.body.removeChild(textArea);
      }
      setShowShareMenu(false);
    }
  };

  const handleCopyCastHash = async () => {
    if (!cast.hash) return;
    try {
      await navigator.clipboard.writeText(cast.hash);
      setShowShareMenu(false);
    } catch (error) {
      console.error('Failed to copy cast hash:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = cast.hash;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      // Check if element still has a parent before removing (prevents errors in Strict Mode)
      if (textArea.parentNode) {
        document.body.removeChild(textArea);
      }
      setShowShareMenu(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!cast.hash) return;
    const shareLink = `${window.location.origin}/cast/${cast.hash}`;
    try {
      await navigator.clipboard.writeText(shareLink);
      setShowShareMenu(false);
    } catch (error) {
      console.error('Failed to copy share link:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      // Check if element still has a parent before removing (prevents errors in Strict Mode)
      if (textArea.parentNode) {
        document.body.removeChild(textArea);
      }
      setShowShareMenu(false);
    }
  };

  const handleTranslateToEnglish = async () => {
    if (!cast.text || isTranslating || translatedText) return;
    
    setIsTranslating(true);
    setShowShareMenu(false);
    
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: cast.text }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Translation failed');
      }

      const data = await response.json();
      setTranslatedText(data.translatedText);
    } catch (error: any) {
      console.error('Failed to translate:', error);
      alert(error.message || 'Failed to translate. Please try again.');
    } finally {
      setIsTranslating(false);
    }
  };

  const deleteModalTitle = isReply ? "Remove Reply from Depthcaster" : "Remove Curation";
  const deleteModalDescription = isReply
    ? "Are you sure you want to remove this reply from Depthcaster? This action cannot be undone."
    : "Are you sure you want to remove this curation? This action cannot be undone.";

  const handleDelete = async () => {
    if (!user?.fid) {
      return;
    }

    setShowDeleteConfirm(false);

    try {
      setIsDeleting(true);
      
      const endpoint = isReply 
        ? `/api/cast/reply/${cast.hash}?fid=${user.fid}`
        : `/api/cast/${cast.hash}?fid=${user.fid}`;
      
      const response = await fetch(endpoint, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete");
      }

      // Refresh the view
      if (onUpdate) {
        onUpdate();
      } else {
        // If no onUpdate callback, navigate away or reload
        router.push("/");
      }
    } catch (error: any) {
      console.error("Delete error:", error);
      alert(error.message || "Failed to delete. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUncurate = async () => {
    if (!user?.fid) {
      return;
    }

    setShowUncurateConfirm(false);

    try {
      setIsCurating(true);
      
      const response = await fetch(`/api/curate?castHash=${cast.hash}&curatorFid=${user.fid}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 403) {
          // Silently fail for non-curators
          return;
        } else {
          console.error("Uncurate error:", errorData.error || "Failed to uncurate cast");
        }
        return;
      }

            // Refresh curation status
            const checkResponse = await fetch(`/api/curate?castHash=${cast.hash}`);
            if (checkResponse.ok) {
              const data = await checkResponse.json();
              setIsCurated(data.isCurated);
              // Use curators in chronological order (oldest first) from API
              setCurators(data.curatorInfo || []);
            }

      // Track analytics
      analytics.trackUncurateCast(cast.hash, user.fid);

      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      console.error("Uncurate error:", error);
    } finally {
      setIsCurating(false);
    }
  };

  const handleCurate = () => {
    if (!user?.fid) {
      return;
    }

    // Always show collection selection modal (available to all logged-in users)
    // Users can add casts to collections even if they've already curated them
    setShowCollectionSelectModal(true);
  };

  const handleConfirmCurate = async (collectionName: string | null = null) => {
    if (!user?.fid) {
      return;
    }

    // Curate the cast (either not curated, or curated by others)
    try {
      setIsCurating(true);
      setShowCollectionSelectModal(false);
      
      // If collectionName is provided, add to collection instead of main feed
      const apiEndpoint = collectionName 
        ? `/api/collections/${collectionName}/curate`
        : "/api/curate";
      
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          castHash: cast.hash,
          curatorFid: user.fid,
          castData: cast,
          translatedText: translatedText || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 403) {
          // Silently fail for non-curators
          return;
        } else if (response.status === 409) {
          // Already curated or already in collection
          if (collectionName) {
            // Show message for collection
            window.dispatchEvent(new CustomEvent("showToast", { 
              detail: { message: errorData.error || "Cast is already in this collection", type: "info" } 
            }));
          } else {
            // Already curated to main feed, refresh status
            const checkResponse = await fetch(`/api/curate?castHash=${cast.hash}`);
            if (checkResponse.ok) {
              const data = await checkResponse.json();
              setIsCurated(data.isCurated);
              // Use curators in chronological order (oldest first) from API
              setCurators(data.curatorInfo || []);
            }
          }
        } else {
          // Show error message
          window.dispatchEvent(new CustomEvent("showToast", { 
            detail: { message: errorData.error || "Failed to add cast to collection", type: "error" } 
          }));
          console.error("Curate error:", errorData.error || "Failed to curate cast");
        }
        return;
      }

      // Success - refresh curation status (only for main feed)
      let updatedCurators: Array<{ fid: number; username?: string; display_name?: string; pfp_url?: string }> = [];
      if (!collectionName) {
        const checkResponse = await fetch(`/api/curate?castHash=${cast.hash}`);
        if (checkResponse.ok) {
          const data = await checkResponse.json();
          setIsCurated(data.isCurated);
          // Use curators in chronological order (oldest first) from API
          updatedCurators = data.curatorInfo || [];
          setCurators(updatedCurators);
        }
      } else {
        // For collections, use current curators list
        updatedCurators = curators;
      }

      // Track analytics
      analytics.trackCurateCast(cast.hash, user.fid);

      // Show curated toast
      const successMessage = collectionName 
        ? `Added to collection: ${collectionName}`
        : "Curated to your feed";
      window.dispatchEvent(new CustomEvent("showToast", { 
        detail: { message: successMessage, type: "success" } 
      }));

      // Scroll to the cast in the feed
      window.dispatchEvent(new CustomEvent("scrollToCast", { detail: cast.hash }));

      // Check if auto-like is enabled and handle auto-like
      if (user?.fid && user?.signer_uuid) {
        try {
          // Fetch user preferences
          const prefsResponse = await fetch(
            `/api/user/preferences?fid=${user.fid}&signerUuid=${user.signer_uuid}`
          );
          if (prefsResponse.ok) {
            const prefsData = await prefsResponse.json();
            const autoLikeEnabled = prefsData.autoLikeOnCurate !== undefined ? prefsData.autoLikeOnCurate : true;
            const hasSeenNotification = prefsData.hasSeenAutoLikeNotification || false;

            // Check if cast is curated by deepbot (use updated curators list)
            const isCuratedByDeepbot = updatedCurators.some(c => c.username?.toLowerCase() === "deepbot");

            // Auto-like if enabled and not curated by deepbot
            if (autoLikeEnabled && !isCuratedByDeepbot) {
              try {
                await fetch("/api/reaction", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    signerUuid: user.signer_uuid,
                    reactionType: "like",
                    target: cast.hash,
                    targetAuthorFid: cast.author.fid,
                  }),
                });
              } catch (error) {
                console.error("Failed to auto-like cast:", error);
              }
            }

            // Show notification if first time
            if (!hasSeenNotification && autoLikeEnabled) {
              setShowAutoLikeNotification(true);
              // Update hasSeenAutoLikeNotification flag
              try {
                await fetch("/api/user/preferences", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    fid: user.fid,
                    signerUuid: user.signer_uuid,
                    hasSeenAutoLikeNotification: true,
                  }),
                });
              } catch (error) {
                console.error("Failed to update notification flag:", error);
              }
            }
          }
        } catch (error) {
          console.error("Failed to fetch preferences for auto-like:", error);
        }
      }

      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      console.error("Curate error:", error);
    } finally {
      setIsCurating(false);
    }
  };

  const handleTag = async (tag: string) => {
    if (!user?.fid || !cast.hash) {
      return;
    }

    const isTagged = tags.includes(tag);
    
    try {
      setIsTagging(true);
      setShowTagMenu(false);

      const url = isTagged 
        ? `/api/tags?castHash=${cast.hash}&tag=${encodeURIComponent(tag)}&adminFid=${user.fid}`
        : "/api/tags";
      
      const response = await fetch(url, {
        method: isTagged ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: isTagged ? undefined : JSON.stringify({
          castHash: cast.hash,
          tag,
          adminFid: user.fid,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Tag error:", errorData.error || "Failed to toggle tag");
        return;
      }

      // Refresh tags
      const tagsResponse = await fetch(`/api/tags?castHash=${cast.hash}`);
      if (tagsResponse.ok) {
        const tagsData = await tagsResponse.json();
        setTags(tagsData.tags?.map((t: any) => t.tag) || []);
      }
    } catch (error: any) {
      console.error("Tag error:", error);
    } finally {
      setIsTagging(false);
    }
  };

  const timestamp = new Date(cast.timestamp);
  const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });
  
  // Get quality score and category from cast metadata
  const qualityScore = (cast as any)._qualityScore;
  const category = (cast as any)._category;
  
  // Helper function to format category name (convert hyphens to readable format)
  const formatCategoryName = (cat: string): string => {
    return cat.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };
  
  // Helper function to get quality score color
  const getQualityColor = (score: number): string => {
    if (score >= 80) return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20";
    return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800";
  };

  // Helper function to get quality score text color for button highlighting
  const getQualityTextColor = (score: number): string => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-gray-600 dark:text-gray-400";
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicks are disabled
    if (disableClick) {
      return;
    }
    
    // Don't navigate if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('a') ||
      target.closest('button') ||
      target.closest('[role="button"]') ||
      target.closest('.recast-menu') ||
      target.closest('.share-menu') ||
      target.closest('img[onClick]')
    ) {
      return;
    }
    
    if (cast.hash) {
      // Navigate to conversation view for curated casts in feed view, regular cast view otherwise
      // In the curated feed, all casts should go to conversation view
      const isCurated = feedType === "curated" || cast._curatorFid;
      router.push(isCurated ? `/conversation/${cast.hash}` : `/cast/${cast.hash}`);
    }
  };

  return (
    <>
      <div 
        ref={castCardRef}
        data-cast-hash={cast.hash}
        className={`border-b border-gray-200 dark:border-gray-800 py-4 sm:py-6 px-2 sm:px-4 transition-colors relative ${disableClick ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer'}`}
        onClick={handleCardClick}
      >
        {/* Share menu and Curator badge - top right corner */}
        <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Translation spinner */}
          {isTranslating && (
            <div className="flex items-center justify-center">
              <svg className="animate-spin h-4 w-4 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
          {/* Share button */}
          {!displayMode?.hideShareButton && (
            <div className="relative share-menu" ref={shareMenuRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowShareMenu(!showShareMenu);
                }}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                title="Share"
              >
                <Share2 className="w-4 h-4" />
              </button>

            {/* Share dropdown menu */}
            {showShareMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 min-w-[180px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenInFarcaster();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Open in Farcaster
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyText();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-t border-gray-200 dark:border-gray-700"
                >
                  Copy text
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyCastHash();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-t border-gray-200 dark:border-gray-700"
                >
                  Copy cast hash
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyShareLink();
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-t border-gray-200 dark:border-gray-700"
                >
                  Copy share link
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTranslateToEnglish();
                  }}
                  disabled={!cast.text || isTranslating || !!translatedText}
                  className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-t border-gray-200 dark:border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTranslating ? 'Translating...' : 'Translate to English'}
                </button>
              </div>
            )}
            </div>
          )}

          {/* Tags - show when cast has tags */}
          {tags.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 mb-2 flex-wrap">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Curated by pill - show when cast has curators */}
          {curators.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-full border border-blue-200 dark:border-blue-800">
              {/* First curator name */}
              <span className="hidden sm:inline text-xs text-blue-700 dark:text-blue-300 font-medium">
                Curated by {curators[0]?.display_name || curators[0]?.username || `@user${curators[0]?.fid}`}
              </span>
              
              {/* First curator PFP - always show if available */}
              {curators[0] && (
                <Link
                  href={`/profile/${curators[0].fid}`}
                  onClick={(e) => e.stopPropagation()}
                  className="relative"
                >
                  <AvatarImage
                    src={curators[0].pfp_url}
                    alt={curators[0].username || "Curator"}
                    size={24}
                    className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white dark:border-gray-900 object-cover"
                  />
                </Link>
              )}
              
              {/* Overlapping PFPs - show curators 2-5 (max 4 PFPs) */}
              {curators.length > 1 && (
                <div className="flex items-center -space-x-2">
                  {curators.slice(1, 5).map((curator) => (
                    <Link
                      key={curator.fid}
                      href={`/profile/${curator.fid}`}
                      onClick={(e) => e.stopPropagation()}
                      className="relative"
                    >
                      <AvatarImage
                        src={curator.pfp_url}
                        alt={curator.username || `Curator ${curator.fid}`}
                        size={24}
                        className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white dark:border-gray-900 object-cover"
                      />
                    </Link>
                  ))}
                  {/* Show count if more than 5 curators total (1 name + 1 PFP + 4 PFPs) */}
                  {curators.length > 5 && (
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white dark:border-gray-900 bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        +{curators.length - 5}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex gap-2 sm:gap-3">
          {/* Avatar */}
          {(() => {
            // Use new granular option if set, otherwise fall back to hideAuthorInfo for backward compatibility
            const shouldHidePfp = displayMode?.hideAuthorPfp ?? (displayMode?.hideAuthorInfo && !displayMode?.hideAuthorDisplayName && !displayMode?.hideAuthorUsername && !displayMode?.hideAuthorPfp);
            return !shouldHidePfp ? (
              <Link href={`/profile/${author.fid}`} onClick={(e) => e.stopPropagation()}>
                <AvatarImage
                  src={author.pfp_url}
                  alt={author.username}
                  size={48}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0 object-cover"
                />
              </Link>
            ) : null;
          })()}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Parent cast display for quote casts that are not root */}
            {(cast as any)._isQuoteCast && (cast as any)._parentCast && (() => {
              const parentCast = (cast as any)._parentCast;
              return (
                <div className="mb-2 -mx-2 px-2">
                  <div className="mb-1.5">
                    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Replying to
                    </span>
                  </div>
                  <Link 
                    href={`/cast/${parentCast.hash}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-start gap-2 hover:opacity-80 transition-opacity bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 border border-gray-200 dark:border-gray-700 group/parent"
                  >
                  <AvatarImage
                    src={parentCast.author?.pfp_url}
                    alt={parentCast.author?.username || "parent"}
                    size={24}
                    className="w-6 h-6 rounded-full flex-shrink-0"
                  />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {parentCast.author?.display_name || parentCast.author?.username}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          @{parentCast.author?.username}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {renderTextWithLinks(parentCast.text || "", router, true, displayMode?.hideUrlLinks)}
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })()}
            
            {/* Author info */}
            {(() => {
              // Use new granular options if set, otherwise fall back to hideAuthorInfo for backward compatibility
              const hideAll = displayMode?.hideAuthorInfo && !displayMode?.hideAuthorDisplayName && !displayMode?.hideAuthorUsername && !displayMode?.hideAuthorPfp;
              const hideDisplayName = displayMode?.hideAuthorDisplayName ?? hideAll;
              const hideUsername = displayMode?.hideAuthorUsername ?? hideAll;
              
              // Don't render the container if both are hidden
              if (hideDisplayName && hideUsername) {
                return null;
              }
              
              return (
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2 flex-wrap">
                  {!hideDisplayName && (
                    <Link href={`/profile/${author.fid}`} onClick={(e) => e.stopPropagation()}>
                      <span className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100 hover:underline cursor-pointer">
                        {author.display_name || author.username}
                      </span>
                    </Link>
                  )}
                  {!hideUsername && (
                    <span className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">
                      @{author.username}
                    </span>
                  )}
              {hasActiveProSubscription(author as any) && (
                <span className="text-blue-500 text-sm" title="Pro User">
                  ⚡
                </span>
              )}
              <CuratorBadge userFid={author.fid} viewerFid={user?.fid} isCurator={isAuthorCurator} className="ml-1" />
              <span className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm">
                · {timeAgo}
              </span>
              {(cast as any)._isQuoteCast && (
                <span 
                  className="text-blue-500 dark:text-blue-400 text-xs sm:text-sm ml-0.5" 
                  title="Quote cast - This cast quotes the root cast of this conversation"
                  aria-label="Quote cast"
                >
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </span>
              )}
                </div>
              );
            })()}

            {/* Cast text */}
            <div className="text-gray-900 dark:text-gray-100 mb-2 sm:mb-3 text-sm sm:text-base leading-6 sm:leading-7">
              {(() => {
                // Process text: strip prefix and prepare for first line bold
                let processedText = translatedText || cast.text || "";
                
                // Strip prefix(es) if specified - supports both single string (backward compatible) and array
                if (displayMode?.stripTextPrefix) {
                  const prefixes = Array.isArray(displayMode.stripTextPrefix) 
                    ? displayMode.stripTextPrefix 
                    : [displayMode.stripTextPrefix];
                  
                  // Try each prefix in order, strip the first one that matches
                  for (const prefix of prefixes) {
                    if (prefix && processedText.startsWith(prefix)) {
                      processedText = processedText.substring(prefix.length);
                      // Trim leading whitespace after removing prefix
                      processedText = processedText.trimStart();
                      break; // Only strip the first matching prefix
                    }
                  }
                }
                
                // Replace characters if specified (e.g., replace ";" with newline)
                if (displayMode?.replaceCharacters && displayMode.replaceCharacters.length > 0) {
                  for (const replacement of displayMode.replaceCharacters) {
                    if (replacement.from && replacement.to !== undefined) {
                      // Handle special escape sequences: "\n" (two characters) -> actual newline
                      let toValue = replacement.to;
                      // Convert escape sequences
                      toValue = toValue.replace(/\\n/g, "\n"); // \n -> newline
                      toValue = toValue.replace(/\\t/g, "\t"); // \t -> tab
                      toValue = toValue.replace(/\\r/g, "\r"); // \r -> carriage return
                      processedText = processedText.replaceAll(replacement.from, toValue);
                    }
                  }
                }
                
                // Split into first line and rest if boldFirstLine is enabled
                const shouldBoldFirstLine = displayMode?.boldFirstLine;
                let firstLine = "";
                let restOfText = "";
                
                if (shouldBoldFirstLine) {
                  const firstNewlineIndex = processedText.indexOf('\n');
                  if (firstNewlineIndex !== -1) {
                    firstLine = processedText.substring(0, firstNewlineIndex);
                    restOfText = '\n' + processedText.substring(firstNewlineIndex + 1);
                  } else {
                    // If no newline, find first sentence or first ~100 chars
                    const firstPeriod = processedText.indexOf('. ');
                    const firstExclamation = processedText.indexOf('! ');
                    const firstQuestion = processedText.indexOf('? ');
                    const firstBreak = Math.min(
                      firstPeriod !== -1 ? firstPeriod + 1 : Infinity,
                      firstExclamation !== -1 ? firstExclamation + 1 : Infinity,
                      firstQuestion !== -1 ? firstQuestion + 1 : Infinity,
                      processedText.length > 100 ? 100 : processedText.length
                    );
                    if (firstBreak < processedText.length) {
                      firstLine = processedText.substring(0, firstBreak);
                      restOfText = processedText.substring(firstBreak);
                    } else {
                      firstLine = processedText;
                    }
                  }
                } else {
                  restOfText = processedText;
                }
                
                const renderProcessedText = (text: string) => {
                  return renderTextWithLinks(text, router, false, displayMode?.hideUrlLinks);
                };
                
                return shouldCollapseCuratedCastText && !isCuratedCastExpanded && collapsedCuratedCastSegments ? (
                  <div className="space-y-1 whitespace-pre-wrap break-words">
                    {collapsedCuratedCastSegments.topText && (
                      <div>{renderTextWithLinks(collapsedCuratedCastSegments.topText, router, false, displayMode?.hideUrlLinks)}</div>
                    )}
                    <button
                      type="button"
                      className="w-full text-left text-blue-600 dark:text-blue-400 hover:underline focus:outline-none"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCuratedCastExpanded(true);
                      }}
                    >
                      {`… ${collapsedCuratedCastSegments.hiddenCount} line${
                        collapsedCuratedCastSegments.hiddenCount === 1 ? "" : "s"
                      } hidden …`}
                    </button>
                    {collapsedCuratedCastSegments.bottomText && (
                      <div>{renderTextWithLinks(collapsedCuratedCastSegments.bottomText, router, false, displayMode?.hideUrlLinks)}</div>
                    )}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words">
                    {shouldBoldFirstLine && firstLine ? (
                      <>
                        <span className="font-bold">{renderProcessedText(firstLine)}</span>
                        {restOfText && renderProcessedText(restOfText)}
                      </>
                    ) : (
                      renderProcessedText(processedText)
                    )}
                  </div>
                );
              })()}
            </div>
            {shouldCollapseCuratedCastText && isCuratedCastExpanded && (
              <button
                type="button"
                className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2 sm:mb-3"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCuratedCastExpanded(false);
                }}
              >
                Collapse
              </button>
            )}

            {/* Expanded Mentioned Profiles */}
            {displayMode?.expandMentionedProfiles && cast.mentioned_profiles && cast.mentioned_profiles.length > 0 && (() => {
              // Deduplicate profiles by FID - only show one card per unique profile
              const seenFids = new Set<number>();
              const uniqueProfiles = cast.mentioned_profiles.filter((profile: any) => {
                if (!profile.fid) return false;
                if (seenFids.has(profile.fid)) {
                  return false;
                }
                seenFids.add(profile.fid);
                return true;
              });
              
              return uniqueProfiles.length > 0 ? (
                <div className="my-3 space-y-3">
                  {uniqueProfiles.map((profile: any) => (
                    <MentionedProfileCard key={profile.fid} profile={profile} viewerFid={user?.fid} />
                  ))}
                </div>
              ) : null;
            })()}

            {/* Check for blog links in cast text (that might not be embeds yet) */}
            {(() => {
              const blogUrlsInText: string[] = [];
              if (cast.text) {
                console.log('[CastCard] Checking cast text for blog links:', cast.text);
                // Extract URLs from text using the same regex pattern
                const urlRegex = /(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"']+)/g;
                let match;
                const text = cast.text;
                const allUrls: string[] = [];
                while ((match = urlRegex.exec(text)) !== null) {
                  let url = match[1] || match[2];
                  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                  }
                  // Clean up URL - remove trailing punctuation that might have been captured
                  if (url) {
                    url = url.trim().replace(/[.,;:!?)\]'"`]+$/, '');
                  }
                  allUrls.push(url);
                  console.log('[CastCard] Found URL in text:', url);
                  const blogPlatform = url ? isBlogLink(url) : null;
                  console.log('[CastCard] Blog platform check for', url, ':', blogPlatform);
                  if (url && blogPlatform) {
                    // Check if this URL is already in embeds (normalize for comparison)
                    const normalizedUrl = url.replace(/\/$/, ''); // Remove trailing slash
                    const isInEmbeds = cast.embeds?.some((embed: any) => {
                      if (!embed.url) return false;
                      const normalizedEmbedUrl = embed.url.replace(/\/$/, '');
                      return normalizedEmbedUrl === normalizedUrl || 
                             normalizedEmbedUrl === url || 
                             embed.url === url;
                    });
                    console.log('[CastCard] Blog link in embeds?', isInEmbeds);
                    if (!isInEmbeds) {
                      blogUrlsInText.push(url);
                      console.log('[CastCard] ✓ Adding blog link from text:', url);
                    }
                  }
                }
                console.log('[CastCard] All URLs found:', allUrls);
                console.log('[CastCard] Blog URLs from text:', blogUrlsInText);
              }
              
              if (blogUrlsInText.length > 0) {
                console.log('[CastCard] Rendering', blogUrlsInText.length, 'blog preview(s) from text');
                return (
                  <div className="mb-3 space-y-2">
                    {blogUrlsInText.map((url, idx) => (
                      <div key={`blog-text-${idx}`} onClick={(e) => e.stopPropagation()}>
                        <BlogPreview url={url} />
                      </div>
                    ))}
                  </div>
                );
              }
              return null;
            })()}

            {/* Embeds */}
            {cast.embeds && cast.embeds.length > 0 && (() => {
              // Check if we should replace embeds with a custom button
              // If so, skip rendering embeds (button will be shown in action buttons row)
              if (displayMode?.replaceEmbeds) {
                return null;
              }
              
              const hideImages = shouldHideImages();
              
              // First pass: group embeds by type
              const embedGroups: Array<{ type: 'images' | 'other', embeds: any[], indices: number[] }> = [];
              let currentImageGroup: { embeds: any[], indices: number[] } | null = null;
              
              cast.embeds.forEach((embed: any, index: number) => {
                console.log('[CastCard] Processing embed', index, ':', embed.url);
                // Check if this is a blog link first - these should always be in "other" group
                const embedBlogPlatform = embed.url ? isBlogLink(embed.url) : null;
                if (embed.url && embedBlogPlatform) {
                  console.log('[CastCard] ✓ Found blog link in embed:', embed.url, 'platform:', embedBlogPlatform);
                  // Close current image group if exists
                  if (currentImageGroup) {
                    embedGroups.push({ type: 'images', embeds: currentImageGroup.embeds, indices: currentImageGroup.indices });
                    currentImageGroup = null;
                  }
                  // Add as other embed (blog links get special treatment)
                  embedGroups.push({ type: 'other', embeds: [embed], indices: [index] });
                  return; // Skip the rest of the processing for this embed
                }
                
                // Check if this is a direct image embed
                const isDirectImage = embed.url && (
                  embed.metadata?.image || 
                  (embed.metadata?.content_type && embed.metadata.content_type.startsWith('image/'))
                );
                
                // Check if this is an image-only link embed (no title/description, just image)
                let isImageOnlyLink = false;
                if (embed.url && !isDirectImage) {
                  const metadata = embed.metadata;
                  let imageUrl: string | null = null;
                  let title: string | null = null;
                  let description: string | null = null;
                  
                  // Extract image URL
                  if (metadata?.html?.ogImage) {
                    const ogImages = Array.isArray(metadata.html.ogImage) ? metadata.html.ogImage : [metadata.html.ogImage];
                    const nonEmojiImage = ogImages.find((img: any) => {
                      if (!img.url) return false;
                      if (img.type === 'svg') return false;
                      if (img.url.includes('twimg.com/emoji') || img.url.includes('/svg/')) return false;
                      return true;
                    });
                    if (nonEmojiImage) imageUrl = nonEmojiImage.url;
                  }
                  
                  // Extract title/description
                  if (metadata?.html?.oembed) {
                    title = metadata.html.oembed.title || null;
                  }
                  if (metadata?.html && !metadata.html.oembed) {
                    title = metadata.html.ogTitle || metadata.html.title || null;
                    description = metadata.html.ogDescription || metadata.html.description || null;
                  }
                  if (!title && metadata?.title) title = metadata.title;
                  if (!description && metadata?.description) description = metadata.description;
                  
                  // Check fetched metadata if available
                  const fetchedMeta = embedMetadata.get(embed.url);
                  if (fetchedMeta) {
                    if (!title && fetchedMeta.title) title = fetchedMeta.title;
                    if (!description && fetchedMeta.description) description = fetchedMeta.description;
                    if (!imageUrl && fetchedMeta.image) imageUrl = fetchedMeta.image;
                  }
                  
                  // Consider it image-only if it has an image but no meaningful title/description
                  isImageOnlyLink = !!imageUrl && !title && !description;
                }
                
                if ((isDirectImage || isImageOnlyLink) && !hideImages) {
                  // Add to current image group or start new one
                  if (!currentImageGroup) {
                    currentImageGroup = { embeds: [], indices: [] };
                  }
                  currentImageGroup.embeds.push(embed);
                  currentImageGroup.indices.push(index);
                } else {
                  // Close current image group if exists
                  if (currentImageGroup) {
                    embedGroups.push({ type: 'images', embeds: currentImageGroup.embeds, indices: currentImageGroup.indices });
                    currentImageGroup = null;
                  }
                  // Add as other embed
                  embedGroups.push({ type: 'other', embeds: [embed], indices: [index] });
                }
              });
              
              // Close any remaining image group
              if (currentImageGroup) {
                const imageGroup: { embeds: any[], indices: number[] } = currentImageGroup;
                embedGroups.push({ 
                  type: 'images' as const, 
                  embeds: imageGroup.embeds, 
                  indices: imageGroup.indices 
                });
              }
              
              return (
                <div className="mb-3 space-y-2">
                  {embedGroups.map((group, groupIndex) => {
                    if (group.type === 'images') {
                      // Render image group with dynamic layout based on actual image dimensions
                      return (
                        <DynamicImageGrid
                          key={`image-group-${groupIndex}`}
                          embeds={group.embeds}
                          indices={group.indices}
                          embedMetadata={embedMetadata}
                          onImageClick={setSelectedImage}
                        />
                      );
                    } else {
                      // Render other embeds normally
                      return (
                        <div key={`embed-group-${groupIndex}`}>
                          {group.embeds.map((embed: any, embedIndex: number) => {
                        const index = group.indices[embedIndex];
                        
                        // URL embed (images, videos, links)
                        if (embed.url) {
                          console.log('[CastCard] Rendering embed URL:', embed.url);
                          // Check if this is a blog link - render special preview
                          const renderBlogPlatform = isBlogLink(embed.url);
                          if (renderBlogPlatform) {
                            console.log('[CastCard] ✓ Rendering blog preview for embed:', embed.url, 'platform:', renderBlogPlatform);
                            return (
                              <div key={index} onClick={(e) => e.stopPropagation()}>
                                <BlogPreview url={embed.url} />
                              </div>
                            );
                          }

                          const metadata = embed.metadata;
                          const urlObj = new URL(embed.url);
                          const isXEmbed = urlObj.hostname === 'x.com' || urlObj.hostname === 'twitter.com';
                          const isYouTube = urlObj.hostname === 'youtube.com' || urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtu.be' || urlObj.hostname === 'www.youtu.be';
                          
                          // Extract metadata from various possible structures
                          let imageUrl: string | null = null;
                          let title: string | null = null;
                          let description: string | null = null;
                          let authorName: string | null = null;
                    
                    // Check for Neynar's HTML metadata structure with oEmbed
                    if (metadata?.html?.oembed) {
                      const oembed = metadata.html.oembed;
                      authorName = oembed.author_name || null;
                      title = oembed.title || (authorName ? `Tweet by ${authorName}` : 'Tweet') || null;
                      
                      // Extract description from oEmbed HTML
                      if (oembed.html && !description) {
                        try {
                          // Parse the HTML to extract text content from the <p> tag
                          const htmlContent = oembed.html;
                          // Extract content from <p> tag inside blockquote
                          const pMatch = htmlContent.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
                          if (pMatch) {
                            let text = pMatch[1];
                            // Remove HTML tags
                            text = text.replace(/<[^>]+>/g, ' ');
                            // Decode HTML entities
                            text = text.replace(/&nbsp;/g, ' ')
                                      .replace(/&amp;/g, '&')
                                      .replace(/&lt;/g, '<')
                                      .replace(/&gt;/g, '>')
                                      .replace(/&quot;/g, '"')
                                      .replace(/&#39;/g, "'")
                                      .replace(/<br\s*\/?>/gi, '\n');
                            // Decode numeric entities
                            text = text.replace(/&#(\d+);/g, (_: string, dec: string) => String.fromCharCode(parseInt(dec, 10)));
                            // Clean up whitespace
                            text = text.replace(/\s+/g, ' ').trim();
                            if (text) {
                              description = text;
                            }
                          }
                        } catch (error) {
                        }
                      }
                    }
                    
                    // Check for HTML metadata structure (standard Open Graph)
                    if (metadata?.html && !metadata.html.oembed) {
                      const htmlMeta = metadata.html;
                      const ogImage = htmlMeta.ogImage && htmlMeta.ogImage.length > 0 ? htmlMeta.ogImage[0] : null;
                      imageUrl = ogImage?.url || null;
                      if (!title) {
                        title = htmlMeta.ogTitle || htmlMeta.title || null;
                      }
                      if (!description) {
                        description = htmlMeta.ogDescription || htmlMeta.description || null;
                      }
                    }
                    
                    // Extract image from Neynar's ogImage structure
                    if (!imageUrl && metadata?.html?.ogImage) {
                      const ogImages = Array.isArray(metadata.html.ogImage) ? metadata.html.ogImage : [metadata.html.ogImage];
                      // Filter out Twitter emoji SVGs (warning triangle, etc.)
                      const isTwitterEmoji = (url: string) => {
                        return url.includes('twimg.com/emoji') || url.includes('/svg/');
                      };
                      // Prefer non-emoji images (SVG emojis are usually small icons or placeholders)
                      const nonEmojiImage = ogImages.find((img: any) => {
                        if (!img.url) return false;
                        if (img.type === 'svg') return false;
                        if (isTwitterEmoji(img.url)) return false;
                        return true;
                      });
                      if (nonEmojiImage) {
                        imageUrl = nonEmojiImage.url;
                      } else {
                        // Fallback: use first non-emoji URL if available
                        const fallbackImage = ogImages.find((img: any) => img.url && !isTwitterEmoji(img.url));
                        if (fallbackImage) {
                          imageUrl = fallbackImage.url;
                        }
                      }
                    }
                    
                    // Fallback: check direct metadata properties
                    if (!title && metadata?.title) {
                      title = metadata.title;
                    }
                    if (!description && metadata?.description) {
                      description = metadata.description;
                    }
                    if (!imageUrl && metadata?.image) {
                      imageUrl = typeof metadata.image === 'string' ? metadata.image : metadata.image?.url || null;
                    }
                    
                    // Fallback: check for ogImage directly
                    if (!imageUrl && metadata?.ogImage) {
                      const ogImg = Array.isArray(metadata.ogImage) ? metadata.ogImage[0] : metadata.ogImage;
                      imageUrl = typeof ogImg === 'string' ? ogImg : ogImg?.url || null;
                    }
                    
                    // Use fetched metadata if available and we don't have it from Neynar
                    const fetchedMeta = embedMetadata.get(embed.url);
                    if (fetchedMeta) {
                      if (!title && fetchedMeta.title) title = fetchedMeta.title;
                      if (!description && fetchedMeta.description) description = fetchedMeta.description;
                      if (!imageUrl && fetchedMeta.image) imageUrl = fetchedMeta.image;
                      if (!authorName && fetchedMeta.author_name) authorName = fetchedMeta.author_name;
                    }
                    
                    // Final check: filter out Twitter emoji SVGs before rendering (only for X/Twitter links)
                    if (imageUrl && isXEmbed) {
                      const isTwitterEmoji = imageUrl.includes('twimg.com/emoji') || imageUrl.includes('/svg/');
                      if (isTwitterEmoji) {
                        imageUrl = null;
                      }
                    }
                    
                    // Show card layout if we have any metadata OR if it's a YouTube/X link (even without metadata)
                    if (metadata?.html || title || description || imageUrl || isXEmbed || isYouTube) {
                      
                      // Unified card layout for all link embeds with metadata
                      return (
                        <div 
                          key={index} 
                          className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a
                            href={embed.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <div className="flex">
                              {/* Image on the left - small, full height */}
                              {imageUrl && !hideImages ? (
                                <div className="flex-shrink-0 w-32 sm:w-40 h-32 sm:h-40">
                                  <img
                                    src={imageUrl}
                                    alt={title || "Link preview"}
                                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSelectedImage(imageUrl);
                                    }}
                                    onError={(e) => {
                                      // Hide image if it fails to load
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              ) : isXEmbed && !hideImages ? (
                                // Show X icon placeholder for X/Twitter links without valid image
                                <div className="flex-shrink-0 w-32 sm:w-40 h-32 sm:h-40 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                  <svg className="w-8 h-8 text-gray-900 dark:text-gray-100" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                  </svg>
                                </div>
                              ) : null}
                              
                              {/* Content on the right */}
                              <div className={`flex-1 min-w-0 p-3 sm:p-4 ${imageUrl ? '' : 'flex flex-col justify-between'}`}>
                                <div>
                                  {/* Domain/Platform indicator */}
                                  <div className="flex items-center gap-2 mb-2">
                                    {isXEmbed && (
                                      <svg className="w-4 h-4 text-gray-900 dark:text-gray-100 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                      </svg>
                                    )}
                                    {isYouTube && (
                                      <svg className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                      </svg>
                                    )}
                                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">
                                      {isXEmbed && authorName ? `@${authorName}` : isXEmbed ? 'x.com' : isYouTube ? 'youtube.com' : urlObj.hostname.replace('www.', '')}
                                    </span>
                                  </div>
                                  
                                  {/* Title */}
                                  {title && (
                                    <div className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100 mb-1.5 line-clamp-2">
                                      {title}
                                    </div>
                                  )}
                                  
                                  {/* Description */}
                                  {description && (
                                    <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                                      {description}
                                    </div>
                                  )}
                                  
                                  {/* Fallback: show URL if no title/description */}
                                  {!title && !description && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                                      {embed.url}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </a>
                        </div>
                      );
                    }
                    
                    // Image embed (direct image URL) - skip, already handled in grouping
                    if (metadata?.image || (metadata?.content_type && metadata.content_type.startsWith('image/'))) {
                      if (hideImages) {
                        // Show placeholder or link instead
                        return (
                          <div key={index} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900">
                            <a
                              href={embed.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline text-sm break-all"
                              onClick={(e) => e.stopPropagation()}
                            >
                              [Image hidden] {embed.url}
                            </a>
                          </div>
                        );
                      }
                      // This should not happen as direct images are grouped, but handle as fallback
                      return null;
                    }
                    
                    // Video embed - check metadata.video first, then check if URL is a video file
                    const isVideoUrl = embed.url && (
                      embed.url.includes('.m3u8') ||
                      embed.url.includes('.mp4') ||
                      embed.url.includes('.webm') ||
                      embed.url.includes('.mov') ||
                      embed.url.includes('stream.farcaster.xyz/v1/video') ||
                      metadata?.content_type?.startsWith('video/')
                    );
                    
                    if (metadata?.video || isVideoUrl) {
                      const videoMeta = metadata?.video;
                      const videoUrl = videoMeta?.url || embed.url;
                      return (
                        <div key={index} className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                          <VideoPlayer
                            src={videoUrl}
                            controls
                            className="w-full max-h-96"
                          />
                        </div>
                      );
                    }
                    
                    // Generic URL embed (fallback) - no metadata
                    const isYouTubeFallback = urlObj.hostname === 'youtube.com' || urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtu.be' || urlObj.hostname === 'www.youtu.be';
                    
                    if (isXEmbed || isYouTubeFallback) {
                      return (
                        <div 
                          key={index} 
                          className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 transition-colors p-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a
                            href={embed.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {isXEmbed && (
                                <svg className="w-5 h-5 text-gray-900 dark:text-gray-100" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                              )}
                              {isYouTubeFallback && (
                                <svg className="w-5 h-5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                </svg>
                              )}
                              <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {isXEmbed ? 'View on X' : isYouTubeFallback ? 'View on YouTube' : 'View Link'}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 break-all">
                              {embed.url}
                            </div>
                          </a>
                        </div>
                      );
                    }
                    
                    return (
                      <div 
                        key={index} 
                        className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a
                          href={embed.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm break-all"
                        >
                          {embed.url}
                        </a>
                      </div>
                    );
                  }
                  // Cast embed (quoted cast)
                  if (embed.cast_id || embed.cast) {
                    // Get hash from cast object or cast_id object
                    const quotedCastHash = embed.cast?.hash || 
                                         (embed.cast_id && typeof embed.cast_id === 'object' && 'hash' in embed.cast_id ? embed.cast_id.hash : null);
                    
                    // Check if this cast is a quote cast and if the quoted cast matches the root cast being shown
                    const isQuoteCast = (cast as any)._isQuoteCast;
                    const isQuotingRoot = isQuoteCast && rootCastHash && quotedCastHash === rootCastHash;
                    
                    // If quoting root cast, show only first line; otherwise show full text
                    const quotedCastText = embed.cast?.text || "";
                    const displayQuotedText = isQuotingRoot 
                      ? (quotedCastText.split('\n')[0] || quotedCastText)
                      : quotedCastText;
                    
                    return (
                      <div 
                        key={index} 
                        className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (quotedCastHash) {
                            router.push(`/cast/${quotedCastHash}`);
                          }
                        }}
                      >
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          Quoted cast
                        </div>
                        {embed.cast && (
                          <div className="pl-3 border-l-2 border-gray-300 dark:border-gray-700">
                            <div className="text-xs text-gray-500 dark:text-gray-500 mb-1">
                              @{embed.cast.author?.username || "unknown"}
                            </div>
                            <div className={`text-sm text-gray-900 dark:text-gray-100 mb-2 ${isQuotingRoot ? 'line-clamp-1' : ''}`}>
                              {renderTextWithLinks(displayQuotedText, router, true, displayMode?.hideUrlLinks)}
                            </div>
                            
                            {/* Show embeds from quoted cast in smaller format */}
                            {embed.cast.embeds && embed.cast.embeds.length > 0 && (
                              <div className="mt-2">
                                {/* Collect all image embeds first */}
                                {(() => {
                                  const hideImages = shouldHideImages();
                                  const imageEmbeds: any[] = [];
                                  const imageIndices: number[] = [];
                                  
                                  embed.cast.embeds.forEach((quotedEmbed: any, idx: number) => {
                                    if (quotedEmbed.url) {
                                      const quotedMetadata = quotedEmbed.metadata;
                                      
                                      // Check if it's a direct image embed
                                      const isDirectImage = quotedMetadata?.image || 
                                        (quotedMetadata?.content_type && quotedMetadata.content_type.startsWith('image/'));
                                      
                                      // Check if it's an image-only link embed
                                      let isImageOnlyLink = false;
                                      if (!isDirectImage && quotedMetadata?.html?.ogImage) {
                                        const ogImages = Array.isArray(quotedMetadata.html.ogImage) ? quotedMetadata.html.ogImage : [quotedMetadata.html.ogImage];
                                        const hasImage = ogImages.some((img: any) => {
                                          if (!img.url) return false;
                                          if (img.type === 'svg') return false;
                                          if (img.url.includes('twimg.com/emoji') || img.url.includes('/svg/')) return false;
                                          return true;
                                        });
                                        
                                        // Check if it has title/description
                                        let hasTitle = false;
                                        let hasDescription = false;
                                        if (quotedMetadata.html?.oembed) {
                                          hasTitle = !!quotedMetadata.html.oembed.title;
                                        }
                                        if (quotedMetadata.html && !quotedMetadata.html.oembed) {
                                          hasTitle = !!(quotedMetadata.html.ogTitle || quotedMetadata.html.title);
                                          hasDescription = !!(quotedMetadata.html.ogDescription || quotedMetadata.html.description);
                                        }
                                        
                                        isImageOnlyLink = hasImage && !hasTitle && !hasDescription;
                                      }
                                      
                                      if (isDirectImage || isImageOnlyLink) {
                                        imageEmbeds.push(quotedEmbed);
                                        imageIndices.push(idx);
                                      }
                                    }
                                  });
                                  
                                  if (imageEmbeds.length > 0 && !hideImages) {
                                    return (
                                      <DynamicImageGrid
                                        embeds={imageEmbeds}
                                        indices={imageIndices}
                                        embedMetadata={embedMetadata}
                                        onImageClick={setSelectedImage}
                                      />
                                    );
                                  }
                                  
                                  return null;
                                })()}
                                
                                {/* Show other embeds (nested casts, etc.) */}
                                {embed.cast.embeds.map((quotedEmbed: any, quotedIndex: number) => {
                                  // Skip image embeds (already handled above)
                                  if (quotedEmbed.url) {
                                    const quotedMetadata = quotedEmbed.metadata;
                                    if (quotedMetadata?.html?.ogImage || quotedMetadata?.image || (quotedMetadata?.content_type && quotedMetadata.content_type.startsWith('image/'))) {
                                      return null;
                                    }
                                  }
                                  
                                  // Nested cast embeds (quoted cast within quoted cast)
                                  if (quotedEmbed.cast_id || quotedEmbed.cast) {
                                    return (
                                      <div key={quotedIndex} className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic pl-2 border-l border-gray-300 dark:border-gray-600">
                                        Quoted: @{quotedEmbed.cast?.author?.username || "unknown"}
                                      </div>
                                    );
                                  }
                                  
                                  return null;
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                          })}
                        </div>
                      );
                    }
                  })}
                </div>
              );
            })()}

            {/* Channel and Category */}
            {(cast.channel || (category && !isReply)) && !displayMode?.hideChannelLink && (
              <div className="mb-3 flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                {cast.channel && (
                  <Link
                    href={`/channel/${cast.channel.id}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    <span>/{cast.channel.name}</span>
                  </Link>
                )}
                {/* Category badge - only show for casts, not replies */}
                {category && !isReply && (
                  <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full border border-gray-200 dark:border-gray-700 font-medium">
                    {formatCategoryName(category)}
                  </span>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 sm:gap-6 mt-3 sm:mt-4 flex-wrap" onClick={(e) => e.stopPropagation()}>
              {/* Reply */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!user) {
                      alert("Please sign in to reply");
                      return;
                    }
                    setShowReplyBox(!showReplyBox);
                  }}
                  className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors py-1 px-1 sm:px-0"
                >
                  <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  {(cast.replies?.count || 0) > 0 && <span>{cast.replies?.count || 0}</span>}
                </button>
              </div>

              {/* Like */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLike();
                }}
                disabled={isReacting || !user}
                className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm transition-colors py-1 px-1 sm:px-0 ${
                  isLiked
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${isLiked ? "fill-current" : ""}`} />
                {likesCount > 0 && <span>{likesCount}</span>}
              </button>

              {/* Recast menu */}
              <div className="relative recast-menu" ref={recastMenuRef}>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowRecastMenu(!showRecastMenu);
                  }}
                  disabled={isReacting || !user}
                  className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm transition-colors py-1 px-1 sm:px-0 ${
                    isRecasted
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Repeat2 className={`w-4 h-4 sm:w-5 sm:h-5 ${isRecasted ? "stroke-[3]" : "stroke-[2]"}`} />
                  {recastsCount > 0 && <span>{recastsCount}</span>}
                </button>

                {/* Dropdown menu */}
                {showRecastMenu && user && (
                  <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[160px]">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRecast();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      {isRecasted ? "Undo Recast" : "Recast"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleQuote();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-t border-gray-200 dark:border-gray-700"
                    >
                      Quote Cast
                    </button>
                  </div>
                )}
              </div>

              {/* Quality score indicator and feedback button */}
              {qualityScore !== null && qualityScore !== undefined && (
                <div className="flex items-center gap-2 relative">
                  <div
                    className={`px-2 py-1 rounded text-xs font-medium ${getQualityColor(qualityScore)} cursor-pointer transition-all`}
                    title={`Quality score: ${qualityScore}/100`}
                    onMouseEnter={() => setIsQualityScoreHovered(true)}
                    onMouseLeave={() => setIsQualityScoreHovered(false)}
                    onTouchStart={() => setIsQualityScoreHovered(true)}
                    onTouchEnd={() => {
                      setTimeout(() => setIsQualityScoreHovered(false), 200);
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Trigger the edit button click if user has curated current cast or root cast, or is admin
                      if (user) {
                        const isCuratedByCurrentUser = curators.some(c => c.fid === user.fid);
                        const canProvideFeedback = isCuratedByCurrentUser || hasCuratedRootCast || isAdmin;
                        if (canProvideFeedback) {
                          setShowQualityFeedbackModal(true);
                        } else {
                          setShowCurateFirstMessage(true);
                          setTimeout(() => setShowCurateFirstMessage(false), 3000);
                        }
                      }
                      // Reset hover state after click
                      setTimeout(() => setIsQualityScoreHovered(false), 300);
                    }}
                  >
                    Q: {qualityScore}
                  </div>
                  {user && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Check if user has curated this cast or the root cast, or is admin
                        const isCuratedByCurrentUser = curators.some(c => c.fid === user.fid);
                        const canProvideFeedback = isCuratedByCurrentUser || hasCuratedRootCast || isAdmin;
                        if (!canProvideFeedback) {
                          setShowCurateFirstMessage(true);
                          setTimeout(() => setShowCurateFirstMessage(false), 3000);
                        } else {
                          setShowQualityFeedbackModal(true);
                        }
                      }}
                      onMouseEnter={() => setIsQualityScoreHovered(false)}
                      onMouseLeave={() => setIsQualityScoreHovered(false)}
                      className={`px-1.5 py-1 rounded text-xs transition-colors ${
                        isQualityScoreHovered
                          ? `${getQualityTextColor(qualityScore)} bg-gray-100 dark:bg-gray-800`
                          : "text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                      title="Provide feedback on quality score"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                  )}
                  {showCurateFirstMessage && !isAdmin && (
                    <div className="absolute z-50 top-full left-0 mt-2 px-3 py-2 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-lg whitespace-nowrap">
                      {rootCastHash && rootCastHash !== cast.hash
                        ? "Please curate this cast or the root cast first to provide quality feedback"
                        : "Please curate this cast first to provide quality feedback"}
                      <div className="absolute -top-1 left-4 w-2 h-2 bg-gray-900 dark:bg-gray-800 rotate-45"></div>
                    </div>
                  )}
                </div>
              )}

              {/* Thread link - only show "View conversation" on curated feed */}
              {showThread && cast.hash && (feedType === "curated" || cast._curatorFid) && (
                <div className="flex items-center gap-3 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  <Link
                    href={`/conversation/${cast.hash}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline hidden sm:inline font-medium"
                  >
                    {topReplies.length === 0 && !cast._topReplies?.length ? "Start conversation →" : "View conversation →"}
                  </Link>
                </div>
              )}

              {/* Curate and Tag buttons - positioned on the right */}
              <div className="flex items-center gap-2 ml-auto">
                {/* Display mode button (e.g., "Open Reframe") - positioned on the right */}
                {displayMode?.replaceEmbeds && displayModeLinkUrl && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (displayMode.embedButtonAction === "open-link") {
                        window.open(displayModeLinkUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    style={{
                      backgroundColor: displayMode.buttonBackgroundColor || '#000000',
                      color: displayMode.buttonTextColor || '#ffffff',
                    }}
                    className="px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors hover:opacity-90"
                  >
                    {displayMode.embedButtonText || "Open Link"}
                  </button>
                )}
                {user && !displayMode?.hideCuratedButton && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCurate();
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCurate();
                    }}
                    disabled={isCurating}
                    className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm transition-colors py-1 px-1 sm:px-0 ${
                      isCurated && curators.some(c => c.fid === user.fid)
                        ? "text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                        : "text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={
                      isCurated && curators.some(c => c.fid === user.fid)
                        ? "Remove from curated feed"
                        : isCurated
                        ? "Curate to your feed"
                        : "Curate to your feed"
                    }
                  >
                    <span className={isCurated && curators.some(c => c.fid === user.fid) ? "text-purple-600 dark:text-purple-400" : "text-gray-400 dark:text-gray-500"}>
                      {isCurated && curators.some(c => c.fid === user.fid) ? "Curated" : "Curate to your feed"}
                    </span>
                    <Star className={`w-4 h-4 sm:w-5 sm:h-5 ${isCurated && curators.some(c => c.fid === user.fid) ? "fill-current" : ""}`} />
                  </button>
                )}
                
                {/* Tag button - only visible to admins */}
                {user && isAdmin && (
                  <div className="relative tag-menu" ref={tagMenuRef}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTagMenu(!showTagMenu);
                      }}
                      disabled={isTagging}
                      className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm transition-colors py-1 px-1 sm:px-0 ${
                        tags.length > 0
                          ? "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                          : "text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      title="Tag cast"
                    >
                      <Tag className={`w-4 h-4 sm:w-5 sm:h-5 ${tags.length > 0 ? "fill-current" : ""}`} />
                      {tags.length > 0 && (
                        <span className="text-xs">{tags.length}</span>
                      )}
                    </button>

                    {/* Tag dropdown menu */}
                    {showTagMenu && (
                      <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 min-w-[180px]">
                        <div className="p-2">
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 px-2">Tags</div>
                          {tags.length > 0 && (
                            <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                              {tags.map((tag) => (
                                <button
                                  key={tag}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTag(tag);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex items-center justify-between"
                                >
                                  <span>{tag}</span>
                                  <span className="text-xs text-gray-500">Remove</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTag("build-idea");
                            }}
                            className={`w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
                              tags.includes("build-idea")
                                ? "text-gray-500 dark:text-gray-400 cursor-not-allowed"
                                : "text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                            }`}
                            disabled={tags.includes("build-idea")}
                          >
                            {tags.includes("build-idea") ? "✓ build-idea" : "+ build-idea"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Delete button - only visible to admins */}
                {user && isAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(true);
                    }}
                    disabled={isDeleting}
                    className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm transition-colors py-1 px-1 sm:px-0 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isReply ? "Delete reply" : "Delete cast"}
                  >
                    <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Reply box - shown right after cast for curated feed */}
        {showReplyBox && (feedType === "curated" || cast._curatorFid) && (
          <div className="mt-2 pl-0 sm:pl-14 border-t border-gray-200 dark:border-gray-800 pt-3 sm:pt-4" onClick={(e) => e.stopPropagation()}>
            <CastComposer
              parentHash={cast.hash}
              onSuccess={(newCast) => {
                setShowReplyBox(false);
                
                // Optimistically add the new reply to topReplies immediately
                if (newCast && cast.hash) {
                  // Add metadata to match the format expected by the reply display
                  const optimisticReply = {
                    ...newCast,
                    _replyDepth: 1,
                    _parentCastHash: cast.hash,
                    _isQuoteCast: false,
                    _rootCastHash: cast.hash,
                  };
                  
                  setTopReplies((prev) => {
                    // Check if reply already exists (avoid duplicates)
                    const exists = prev.some((r) => r.hash === newCast.hash);
                    if (exists) {
                      return prev;
                    }
                    // Add to the beginning for newest-first, or end for oldest-first
                    // Based on replySortBy
                    const sortOrder = replySortBy === "recent-reply" ? "newest" : "oldest";
                    if (sortOrder === "newest") {
                      return [optimisticReply, ...prev];
                    } else {
                      return [...prev, optimisticReply];
                    }
                  });
                  
                  // Mark replies as loaded if they weren't already
                  if (!repliesLoaded) {
                    setRepliesLoaded(true);
                  }
                  
                  // Refetch replies after a short delay to ensure we have the latest data
                  // This handles cases where the reply needs to be stored in the database
                  setTimeout(async () => {
                    try {
                      const params = new URLSearchParams({
                        castHash: cast.hash!,
                        sortBy: replySortBy,
                        minQualityScore: replyMinQuality.toString(),
                      });
                      if (user?.fid) {
                        params.append("viewerFid", user.fid.toString());
                      }
                      
                      const res = await fetch(`/api/feed/replies?${params}`);
                      if (res.ok) {
                        const data = await res.json();
                        if (data.replies) {
                          setTopReplies(data.replies);
                          setHasAnyReplies(data.hasAnyReplies !== undefined ? data.hasAnyReplies : true);
                        }
                      }
                    } catch (error) {
                      console.error("Error refetching replies:", error);
                    }
                  }, 2000); // Wait 2 seconds for webhook to process
                }
                
                if (onUpdate) {
                  onUpdate();
                }
              }}
            />
          </div>
        )}

        {/* Top Replies Section */}
        {showTopReplies && (feedType === "curated" || cast._curatorFid) && (
          <div className={`mt-3 border-t ${(cast as any)._isQuoteCast && (cast as any)._parentCast ? 'border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20' : 'border-gray-200 dark:border-gray-800'} pt-3 rounded-b-lg transition-colors group/replies hover:bg-gray-50 dark:hover:bg-gray-800/30`} onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 px-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    data-reply-sort-button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowReplySortMenu(!showReplySortMenu);
                    }}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
                  >
                    {replySortBy === "recent-reply" 
                      ? "Most Recent Replies" 
                      : replySortBy === "highest-quality-replies"
                      ? "Highest Quality Replies"
                      : "Highest Engagement Replies"}
                    <svg
                      className={`w-3 h-3 transition-transform ${showReplySortMenu ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showReplySortMenu && (
                    <div data-reply-sort-menu className="absolute left-0 top-6 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg py-1 min-w-[180px]">
                      {[
                        { value: "highest-quality-replies", label: "Highest Quality Replies" },
                        { value: "highest-engagement", label: "Highest Engagement Replies" },
                        { value: "recent-reply", label: "Most Recent Replies" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          onClick={(e) => {
                            e.stopPropagation();
                            setReplySortBy(option.value as typeof replySortBy);
                            localStorage.setItem("replySortBy", option.value);
                            setShowReplySortMenu(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            replySortBy === option.value
                              ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Quality filter buttons */}
                {replySortBy === "highest-quality-replies" && (
                  <div className="flex items-center gap-1">
                    {[
                      { value: 70, label: "70+" },
                      { value: 60, label: "60+" },
                      { value: 50, label: "50+" },
                      { value: 20, label: "20+" },
                    ].map((filter) => (
                      <button
                        key={filter.value}
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplyMinQuality(filter.value);
                          localStorage.setItem("replyMinQuality", filter.value.toString());
                          // Notify other cast cards to update their filter
                          window.dispatchEvent(new CustomEvent("replyFilterChanged"));
                        }}
                        className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                          replyMinQuality === filter.value
                            ? "bg-blue-600 text-white"
                            : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                )}
                {repliesLoading && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">Loading...</span>
                )}
              </div>
            </div>
            {replyClusters.length > 0 ? (
              <div className="space-y-3">
                {replyClusters.map((cluster) => {
                  const previewItems = buildClusterPreview(cluster.replies);
                  const latestLabel =
                    cluster.latestTimestamp > 0
                      ? formatDistanceToNow(new Date(cluster.latestTimestamp), { addSuffix: true })
                      : null;
                    return (
                    <div
                      key={cluster.id}
                      className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-2.5"
                    >
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span />
                        {latestLabel && <span>Latest {latestLabel}</span>}
                          </div>
                      <div className="space-y-1.5">
                        {previewItems.map((item, idx) =>
                          item.type === "gap" ? (
                            <div
                              key={`gap-${cluster.id}-${idx}`}
                              className="text-center text-xs text-gray-400 dark:text-gray-500"
                            >
                              •••
                          </div>
                          ) : (
                            <ClusterReplyRow
                              key={item.reply.hash || `${cluster.id}-${idx}`}
                              reply={item.reply}
                              rootHash={cast.hash}
                              compressedView={localCompressedView}
                            />
                                )
                              )}
                            </div>
                      {cast.hash && (feedType === "curated" || cast._curatorFid) && (
                        <Link
                          href={`/conversation/${cast.hash}${cluster.rootReplyHash ? `?replyHash=${cluster.rootReplyHash}` : ""}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-3 inline-flex text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {topReplies.length === 1 ? "Start conversation →" : "View conversation →"}
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-2 text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                  {replySortBy === "highest-quality-replies" && replyMinQuality > 0 && hasAnyReplies === true
                    ? `No replies meet the ${replyMinQuality}+ quality threshold`
                    : "No replies yet"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Reply box - shown after replies for non-curated feeds */}
        {showReplyBox && feedType !== "curated" && !cast._curatorFid && (
          <div className="mt-2 pl-0 sm:pl-14 border-t border-gray-200 dark:border-gray-800 pt-3 sm:pt-4" onClick={(e) => e.stopPropagation()}>
            <CastComposer
              parentHash={cast.hash}
              onSuccess={(newCast) => {
                setShowReplyBox(false);
                
                if (onUpdate) {
                  onUpdate();
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <ImageModal
          imageUrl={selectedImage}
          isOpen={!!selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {/* Quote Cast Modal */}
      {showQuoteModal && (
        <QuoteCastModal
          cast={cast}
          isOpen={showQuoteModal}
          onClose={() => setShowQuoteModal(false)}
          onSuccess={() => {
            setShowQuoteModal(false);
            if (onUpdate) {
              onUpdate();
            }
          }}
        />
      )}

      {/* Quality Feedback Modal */}
      {showQualityFeedbackModal && qualityScore !== null && qualityScore !== undefined && (
        <QualityFeedbackModal
          castHash={cast.hash || ""}
          rootCastHash={rootCastHash}
          currentQualityScore={qualityScore}
          isOpen={showQualityFeedbackModal}
          onClose={() => {
            setShowQualityFeedbackModal(false);
            // Refresh the cast to get updated quality score
            if (onUpdate) {
              onUpdate();
            }
          }}
          onSuccess={(newScore, reasoning) => {
            // Update the quality score in the cast object
            (cast as any)._qualityScore = newScore;
            // Store reasoning if available (could be displayed in tooltip or elsewhere)
            if (reasoning) {
              (cast as any)._qualityReasoning = reasoning;
            }
            // Don't close immediately - let the modal show the result
            // The modal will close itself after showing the result
          }}
        />
      )}

      {/* Uncurate Confirmation Modal */}
      {showUncurateConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowUncurateConfirm(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Remove your curation?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to remove your curation? If other curators have curated this cast, it will remain in the curated feed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowUncurateConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUncurate}
                disabled={isCurating}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCurating ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Curate Confirmation Modal */}
      {/* Collection Select Modal (when feature enabled) */}
      {showCollectionSelectModal && (
        <CollectionSelectModal
          isOpen={showCollectionSelectModal}
          onClose={() => setShowCollectionSelectModal(false)}
          onSelect={handleConfirmCurate}
          castHash={cast.hash}
          castData={cast}
          onRemove={async () => {
            // Refresh curation status after removal
            try {
              const response = await fetch(`/api/curate?castHash=${cast.hash}`);
              if (response.ok) {
                const data = await response.json();
                setIsCurated(data.isCurated);
                setCurators(data.curatorInfo || []);
              }
            } catch (error) {
              console.error("Failed to refresh curation status:", error);
            }
          }}
        />
      )}


      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {deleteModalTitle}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {deleteModalDescription}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AutoLikeNotification
        isOpen={showAutoLikeNotification}
        onClose={() => setShowAutoLikeNotification(false)}
        onDisable={async () => {
          if (!user?.fid || !user?.signer_uuid) return;
          try {
            await fetch("/api/user/preferences", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fid: user.fid,
                signerUuid: user.signer_uuid,
                autoLikeOnCurate: false,
              }),
            });
          } catch (error) {
            console.error("Failed to disable auto-like:", error);
          }
        }}
      />
    </>
  );
}
