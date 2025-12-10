/**
 * DeepSeek API integration for cast quality analysis and categorization
 */

import { db } from "@/lib/db";
import { curatedCasts, castReplies } from "@/lib/schema";
import { extractQuotedCastHashes, extractAuthorDataFromCasts } from "@/lib/conversation";
import { eq, sql } from "drizzle-orm";
import { neynarClient } from "@/lib/neynar";
import { LookupCastConversationTypeEnum } from "@neynar/nodejs-sdk/build/api";
import { extractCastTimestamp } from "@/lib/cast-timestamp";
import { extractCastMetadata } from "@/lib/cast-metadata";
import { upsertBulkUsers } from "@/lib/users";
import { isBlogLink } from "./blog";

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export interface QualityAnalysisResult {
  qualityScore: number;
  category: string;
  reasoning?: string;
}

const VALID_CATEGORIES = [
  "crypto-critique",
  "platform-analysis",
  "creator-economy",
  "art-culture",
  "ai-philosophy",
  "community-culture",
  "life-reflection",
  "market-news",
  "playful",
  "other",
] as const;

export type Category = typeof VALID_CATEGORIES[number];

/**
 * Extract cast text from cast data
 */
function extractCastText(castData: any): string {
  if (!castData) return "";
  return castData.text || castData.cast?.text || "";
}

/**
 * Extract content from embeds (quoted casts, links, images, Paragraph articles)
 * Also checks cast text for Paragraph links
 */
async function extractEmbedContent(castData: any): Promise<{
  quotedCastTexts: string[];
  linkMetadata: Array<{ title?: string; description?: string; url: string }>;
  paragraphArticles: Array<{ url: string; title?: string; content?: string; markdown?: string }>;
  imageAlts: string[];
  hasImageEmbeds: boolean;
}> {
  const quotedCastTexts: string[] = [];
  const linkMetadata: Array<{ title?: string; description?: string; url: string }> = [];
  const paragraphArticles: Array<{ url: string; title?: string; content?: string; markdown?: string }> = [];
  const imageAlts: string[] = [];
  let hasImageEmbeds = false;
  const processedBlogUrls = new Set<string>();
  
  // First, collect all blog URLs (Paragraph and Substack) from embeds
  if (castData.embeds && Array.isArray(castData.embeds)) {
    for (const embed of castData.embeds) {
      if (embed.url && isBlogLink(embed.url)) {
        processedBlogUrls.add(embed.url);
      }
    }
  }
  
  // Also check cast text for blog links
  const castText = extractCastText(castData);
  if (castText) {
    const urlRegex = /(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"']+)/g;
    let match;
    while ((match = urlRegex.exec(castText)) !== null) {
      let url = match[1] || match[2];
      if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      if (url && isBlogLink(url)) {
        processedBlogUrls.add(url);
      }
    }
  }
  
  // Process embeds and fetch blog articles in parallel
  const blogPromises: Promise<void>[] = [];
  
  if (castData.embeds && Array.isArray(castData.embeds)) {
    for (const embed of castData.embeds) {
      // Quoted cast - extract text if available (synchronous, no API call)
      if (embed.cast?.text || embed.cast_id) {
        quotedCastTexts.push(embed.cast?.text || "");
        continue; // Skip other checks for quoted casts
      }
      
      // Check if it's an image embed
      const isImageEmbed = embed.metadata?.image || 
                           (embed.metadata?.content_type && embed.metadata.content_type.startsWith('image/'));
      
      if (isImageEmbed) {
        hasImageEmbeds = true;
        // Image alt text
        if (embed.metadata?.alt) {
          imageAlts.push(embed.metadata.alt);
        }
        continue; // Skip link metadata check for image embeds
      }
      
      // Link embed
      if (embed.url && !embed.cast && !embed.cast_id) {
        // Check if it's a blog link (Paragraph or Substack)
        if (isBlogLink(embed.url)) {
          // Fetch blog article content (will be handled in the loop below)
          // For now, just skip adding to linkMetadata - we'll fetch it separately
        } else {
          // Regular link - just use metadata
          const meta = embed.metadata || {};
          linkMetadata.push({
            url: embed.url,
            title: meta.title || meta.html?.ogTitle,
            description: meta.description || meta.html?.ogDescription,
          });
        }
      }
    }
  }
  
  // Fetch all blog articles (Paragraph and Substack) in parallel via unified API
  for (const blogUrl of processedBlogUrls) {
    const fetchPromise = (async () => {
      try {
        console.log('[DeepSeek] Fetching blog article for quality assessment:', blogUrl);
        
        // Use the unified blog API endpoint
        const apiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/blog?url=${encodeURIComponent(blogUrl)}`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          console.warn('[DeepSeek] Failed to fetch blog article:', blogUrl, response.status, response.statusText);
          return;
        }
        
        const postData = await response.json();
        
        paragraphArticles.push({
          url: blogUrl,
          title: postData.title,
          content: postData.staticHtml,
          markdown: postData.markdown,
        });
        console.log('[DeepSeek] Successfully fetched blog article:', postData.title);
      } catch (error) {
        console.error('[DeepSeek] Error processing blog link:', blogUrl, error);
      }
    })();
    blogPromises.push(fetchPromise);
  }
  
  // Wait for all blog article fetches to complete
  if (blogPromises.length > 0) {
    await Promise.all(blogPromises);
  }
  
  return { quotedCastTexts, linkMetadata, paragraphArticles, imageAlts, hasImageEmbeds };
}

/**
 * Check if cast is a quote cast (has embeds with cast)
 */
function isQuoteCast(castData: any): boolean {
  if (!castData) return false;
  
  // Check if cast has embeds with cast_id or cast (indicating it's a quote/recast)
  return castData.embeds?.some((embed: any) => 
    embed.cast_id || (embed.cast && embed.cast.hash)
  ) || false;
}

/**
 * Check if a quote cast is quoting its parent cast
 */
function isQuotingParent(castData: any, quotedCastHash: string): boolean {
  if (!castData || !quotedCastHash) return false;
  return castData.parent_hash === quotedCastHash;
}

const PARENT_CAST_PLACEHOLDER_HASH = "0x0000000000000000000000000000000000000000";

/**
 * Analyze additional text in a parent quote cast and return a quality score (0-100)
 * This is used when a cast quotes its parent - only the additional text adds value
 */
async function analyzeParentQuoteTextQuality(additionalText: string): Promise<number> {
  if (!additionalText || additionalText.trim().length === 0) {
    return 0; // No additional text, no value
  }

  const normalizedText = additionalText.trim();
  const textLength = normalizedText.length;
  const wordCount = normalizedText === "" ? 0 : normalizedText.split(/\s+/).filter(w => w.length > 0).length;
  const hasLettersOrDigits = /[A-Za-z0-9]/.test(normalizedText);

  // Very short or emoji-only: minimal value
  if (!hasLettersOrDigits && textLength > 0) {
    return 5; // Emoji-only
  }
  if (wordCount <= 2 && textLength <= 30) {
    return 10; // Very short, minimal value
  }

  // For longer text, analyze quality to get a score
  const prompt = `Analyze this additional text from a quote cast where someone is quoting their parent cast and adding commentary. Score ONLY the additional text quality (0-100), ignoring the quoted content.

Context: This is additional commentary added when quoting a parent cast. Only the additional text contributes value here.

Evaluate:
1. Does this text add value, insight, or thoughtful commentary? (score 40-100)
2. Is this text neutral - just acknowledging, agreeing, or minimal commentary? (score 10-30)
3. Is this text low-effort, spam, or harmful? (score 0-10)

Additional text: "${normalizedText.substring(0, 500)}${normalizedText.length > 500 ? "..." : ""}"

Respond in JSON format:
{
  "qualityScore": <number 0-100>,
  "reasoning": "<brief explanation>"
}`;

  try {
    const response = await fetch(`${DEEPSEEK_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at analyzing social media commentary quality. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 150,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.warn(`[DeepSeek] Failed to analyze parent quote text, using default score`);
      return 10;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return 10;
    }

    // Parse JSON from response
    let jsonContent = content.trim();
    if (jsonContent.startsWith("```json")) {
      jsonContent = jsonContent.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonContent) as {
      qualityScore?: number;
      reasoning?: string;
    };

    let qualityScore = result.qualityScore;
    if (typeof qualityScore !== "number") {
      qualityScore = parseInt(String(qualityScore || "10"), 10);
    }
    if (isNaN(qualityScore) || qualityScore < 0) qualityScore = 0;
    if (qualityScore > 100) qualityScore = 100;

    console.log(`[DeepSeek] Parent quote text analysis: score=${qualityScore}`);
    return qualityScore;
  } catch (error: any) {
    console.error(`[DeepSeek] Error analyzing parent quote text:`, error.message);
    return 10; // Default on error
  }
}

/**
 * Analyze additional text in a quote cast to determine score adjustment
 * Returns adjustment value: default -10, can go more negative for harmful text or less negative/positive for high quality
 */
async function analyzeAdditionalTextAdjustment(additionalText: string): Promise<number> {
  if (!additionalText || additionalText.trim().length === 0) {
    return -10; // No additional text, default adjustment
  }

  const normalizedText = additionalText.trim();
  const textLength = normalizedText.length;
  const wordCount = normalizedText === "" ? 0 : normalizedText.split(/\s+/).filter(w => w.length > 0).length;
  const hasLettersOrDigits = /[A-Za-z0-9]/.test(normalizedText);

  // Neutral text: single word, emoji, or very short (1-2 words, <= 30 chars)
  // These don't add value but don't harm either - keep default -10
  if (!hasLettersOrDigits && textLength > 0) {
    // Emoji-only
    return -10;
  }
  if (wordCount <= 2 && textLength <= 30) {
    // Very short, likely neutral
    return -10;
  }

  // For longer text, analyze quality to determine adjustment
  const prompt = `Analyze this additional text from a quote cast (someone quoting another cast and adding their own commentary). Determine how this additional text impacts the overall quality:

Context: This is additional commentary added to a quoted cast. The base score adjustment is -10 from the original cast.

Evaluate:
1. Does this text add value, insight, or thoughtful commentary? (positive adjustment: -5 to 0, or even +5 for exceptional commentary)
2. Is this text neutral - just acknowledging, agreeing, or minimal commentary? (keep at -10)
3. Does this text negatively impact the reader's experience - spam, trolling, low-effort, or harmful content? (negative adjustment: -15 to -30)

Additional text: "${normalizedText.substring(0, 500)}${normalizedText.length > 500 ? "..." : ""}"

Respond in JSON format:
{
  "adjustment": <number representing change from base -10, e.g., -5 means final adjustment is -15, +5 means final adjustment is -5>,
  "reasoning": "<brief explanation>"
}`;

  try {
    const response = await fetch(`${DEEPSEEK_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at analyzing social media commentary quality. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 150,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.warn(`[DeepSeek] Failed to analyze additional text, using default -10 adjustment`);
      return -10;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return -10;
    }

    // Parse JSON from response
    let jsonContent = content.trim();
    if (jsonContent.startsWith("```json")) {
      jsonContent = jsonContent.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonContent) as {
      adjustment?: number;
      reasoning?: string;
    };

    let adjustment = result.adjustment;
    if (typeof adjustment !== "number") {
      adjustment = parseInt(String(adjustment || "0"), 10);
    }
    if (isNaN(adjustment)) adjustment = 0;

    // Clamp adjustment: -30 to +10 (so final adjustment ranges from -40 to 0)
    adjustment = Math.max(-30, Math.min(10, adjustment));

    // Base is -10, so add the adjustment
    const finalAdjustment = -10 + adjustment;
    console.log(`[DeepSeek] Additional text analysis: base -10 + adjustment ${adjustment} = ${finalAdjustment}`);
    return finalAdjustment;
  } catch (error: any) {
    console.error(`[DeepSeek] Error analyzing additional text:`, error.message);
    return -10; // Default on error
  }
}

/**
 * Analyze a single cast for quality and category using DeepSeek API
 * @param castData - The cast data to analyze
 * @param analyzingQuotedCast - Internal flag to prevent infinite recursion when analyzing quoted casts
 */
export async function analyzeCastQuality(
  castData: any,
  analyzingQuotedCast: boolean = false
): Promise<QualityAnalysisResult | null> {
  if (!DEEPSEEK_API_KEY) {
    console.warn("[DeepSeek] DEEPSEEK_API_KEY not configured, skipping quality analysis");
    return null;
  }

  const castText = extractCastText(castData);
  
  // Check if this is a quote cast (only if we're not already analyzing a quoted cast to prevent recursion)
  if (!analyzingQuotedCast && isQuoteCast(castData)) {
    // Extract quoted cast hash(es) from embeds
    const quotedCastHashes = extractQuotedCastHashes(castData as any);
    
    if (quotedCastHashes.length > 0) {
      // Try to find the original cast's quality score in the database
      const quotedCastHash = quotedCastHashes[0]; // Use first quoted cast
      
      try {
        // First, check curatedCasts table
        const curatedCast = await db
          .select({
            qualityScore: curatedCasts.qualityScore,
            category: curatedCasts.category,
            castData: curatedCasts.castData,
          })
          .from(curatedCasts)
          .where(eq(curatedCasts.castHash, quotedCastHash))
          .limit(1);
        
        if (curatedCast.length > 0) {
          let originalScore: number | null = curatedCast[0].qualityScore;
          let originalCategory: string | null = curatedCast[0].category;
          
          // If found but not analyzed, analyze it now
          if (originalScore === null) {
            console.log(`[DeepSeek] Quote cast detected, analyzing original cast ${quotedCastHash} from curatedCasts`);
            const originalAnalysis = await analyzeCastQuality(curatedCast[0].castData, true);
            if (originalAnalysis) {
              await db
                .update(curatedCasts)
                .set({
                  qualityScore: originalAnalysis.qualityScore,
                  category: originalAnalysis.category,
                  qualityAnalyzedAt: new Date(),
                })
                .where(eq(curatedCasts.castHash, quotedCastHash));
              originalScore = originalAnalysis.qualityScore;
              originalCategory = originalAnalysis.category;
            }
          }
          
          if (originalScore !== null) {
            // Check if this is quoting the parent cast
            const quotingParent = isQuotingParent(castData, quotedCastHash);
            
            if (quotingParent) {
              // Only score the additional text when quoting parent
              const textScore = await analyzeParentQuoteTextQuality(castText);
              console.log(`[DeepSeek] Parent quote cast detected, scoring only additional text: ${textScore}`);
              return {
                qualityScore: textScore,
                category: originalCategory || "other",
                reasoning: `Parent quote cast - scored only additional text quality: ${textScore}`,
              };
            } else {
              // Quote of different cast - score as adding to conversation
              const adjustment = await analyzeAdditionalTextAdjustment(castText);
              const adjustedScore = Math.max(0, originalScore + adjustment);
              console.log(`[DeepSeek] Quote cast detected (different cast), using original score ${originalScore} + adjustment ${adjustment} = ${adjustedScore}`);
              return {
                qualityScore: adjustedScore,
                category: originalCategory || "other",
                reasoning: `Quote cast scored as original (${originalScore}) with adjustment ${adjustment} based on additional text quality`,
              };
            }
          }
        }
        
        // If not found in curatedCasts, check castReplies table
        const castReply = await db
          .select({
            qualityScore: castReplies.qualityScore,
            category: castReplies.category,
            castData: castReplies.castData,
          })
          .from(castReplies)
          .where(eq(castReplies.replyCastHash, quotedCastHash))
          .limit(1);
        
        if (castReply.length > 0) {
          let originalScore: number | null = castReply[0].qualityScore;
          let originalCategory: string | null = castReply[0].category;
          
          // If found but not analyzed, analyze it now
          if (originalScore === null) {
            console.log(`[DeepSeek] Quote cast detected, analyzing original cast ${quotedCastHash} from castReplies`);
            const originalAnalysis = await analyzeCastQuality(castReply[0].castData, true);
            if (originalAnalysis) {
              await db
                .update(castReplies)
                .set({
                  qualityScore: originalAnalysis.qualityScore,
                  category: originalAnalysis.category,
                  qualityAnalyzedAt: new Date(),
                })
                .where(eq(castReplies.replyCastHash, quotedCastHash));
              originalScore = originalAnalysis.qualityScore;
              originalCategory = originalAnalysis.category;
            }
          }
          
          if (originalScore !== null) {
            // Check if this is quoting the parent cast
            const quotingParent = isQuotingParent(castData, quotedCastHash);
            
            if (quotingParent) {
              // Only score the additional text when quoting parent
              const textScore = await analyzeParentQuoteTextQuality(castText);
              console.log(`[DeepSeek] Parent quote cast detected, scoring only additional text: ${textScore}`);
              return {
                qualityScore: textScore,
                category: originalCategory || "other",
                reasoning: `Parent quote cast - scored only additional text quality: ${textScore}`,
              };
            } else {
              // Quote of different cast - score as adding to conversation
              const adjustment = await analyzeAdditionalTextAdjustment(castText);
              const adjustedScore = Math.max(0, originalScore + adjustment);
              console.log(`[DeepSeek] Quote cast detected (different cast), using original score ${originalScore} + adjustment ${adjustment} = ${adjustedScore}`);
              return {
                qualityScore: adjustedScore,
                category: originalCategory || "other",
                reasoning: `Quote cast scored as original (${originalScore}) with adjustment ${adjustment} based on additional text quality`,
              };
            }
          }
        }
        
        // If not found anywhere, fetch from Neynar, store, and analyze
        if (curatedCast.length === 0 && castReply.length === 0) {
          console.log(`[DeepSeek] Quote cast detected, fetching original cast ${quotedCastHash} from Neynar`);
          try {
            const conversation = await neynarClient.lookupCastConversation({
              identifier: quotedCastHash,
              type: LookupCastConversationTypeEnum.Hash,
              replyDepth: 0,
              includeChronologicalParentCasts: false,
            });
            
            const quotedCastData = conversation.conversation?.cast;
            if (quotedCastData) {
              // Extract metadata
              const metadata = extractCastMetadata(quotedCastData);
              const castCreatedAt = extractCastTimestamp(quotedCastData);
              
              // Ensure author exists in database
              const authorDataMap = extractAuthorDataFromCasts([quotedCastData]);
              if (authorDataMap.size > 0) {
                await upsertBulkUsers(authorDataMap);
              }
              
              // Store in castReplies with placeholder curatedCastHash
              await db
                .insert(castReplies)
                .values({
                  curatedCastHash: PARENT_CAST_PLACEHOLDER_HASH,
                  replyCastHash: quotedCastHash,
                  castData: quotedCastData,
                  castCreatedAt: castCreatedAt,
                  parentCastHash: quotedCastData.parent_hash || null,
                  rootCastHash: PARENT_CAST_PLACEHOLDER_HASH,
                  replyDepth: 0,
                  isQuoteCast: false,
                  quotedCastHash: null,
                  castText: metadata.castText,
                  castTextLength: metadata.castTextLength,
                  authorFid: metadata.authorFid,
                  likesCount: metadata.likesCount,
                  recastsCount: metadata.recastsCount,
                  repliesCount: metadata.repliesCount,
                  engagementScore: metadata.engagementScore,
                })
                .onConflictDoUpdate({
                  target: castReplies.replyCastHash,
                  set: {
                    castData: sql`excluded.cast_data`,
                    castCreatedAt: sql`excluded.cast_created_at`,
                  },
                });
              
              // Analyze the quoted cast synchronously
              console.log(`[DeepSeek] Analyzing fetched original cast ${quotedCastHash}`);
              const originalAnalysis = await analyzeCastQuality(quotedCastData, true);
              if (originalAnalysis) {
                await db
                  .update(castReplies)
                  .set({
                    qualityScore: originalAnalysis.qualityScore,
                    category: originalAnalysis.category,
                    qualityAnalyzedAt: new Date(),
                  })
                  .where(eq(castReplies.replyCastHash, quotedCastHash));
                
                const originalScore = originalAnalysis.qualityScore;
                // Check if this is quoting the parent cast
                const quotingParent = isQuotingParent(castData, quotedCastHash);
                
                if (quotingParent) {
                  // Only score the additional text when quoting parent
                  const textScore = await analyzeParentQuoteTextQuality(castText);
                  console.log(`[DeepSeek] Parent quote cast detected, scoring only additional text: ${textScore}`);
                  return {
                    qualityScore: textScore,
                    category: originalAnalysis.category,
                    reasoning: `Parent quote cast - scored only additional text quality: ${textScore}`,
                  };
                } else {
                  // Quote of different cast - score as adding to conversation
                  const adjustment = await analyzeAdditionalTextAdjustment(castText);
                  const adjustedScore = Math.max(0, originalScore + adjustment);
                  console.log(`[DeepSeek] Quote cast detected (different cast), using fetched original score ${originalScore} + adjustment ${adjustment} = ${adjustedScore}`);
                  return {
                    qualityScore: adjustedScore,
                    category: originalAnalysis.category,
                    reasoning: `Quote cast scored as original (${originalScore}) with adjustment ${adjustment} based on additional text quality`,
                  };
                }
              }
            }
          } catch (error: any) {
            console.error(`[DeepSeek] Error fetching/analyzing original cast ${quotedCastHash}:`, error.message);
            // Fall through to normal analysis
          }
        }
      } catch (error: any) {
        console.error(`[DeepSeek] Error looking up original cast quality score:`, error.message);
        // Fall through to normal analysis
      }
    }
  }
  
  // Extract embed content (including Paragraph articles)
  const embedContent = await extractEmbedContent(castData);
  
  // Log embed information for debugging
  const hasText = castText && castText.trim().length > 0;
  const hasEmbeds = embedContent.quotedCastTexts.length > 0 || 
                    embedContent.linkMetadata.length > 0 || 
                    embedContent.paragraphArticles.length > 0 ||
                    embedContent.imageAlts.length > 0 ||
                    embedContent.hasImageEmbeds;
  
  if (hasEmbeds) {
    console.log(`[DeepSeek] Extracted embed content for analysis:`, {
      hasText,
      quotedCasts: embedContent.quotedCastTexts.length,
      links: embedContent.linkMetadata.length,
      paragraphArticles: embedContent.paragraphArticles.length,
      images: embedContent.imageAlts.length,
      hasImageEmbeds: embedContent.hasImageEmbeds,
      linkUrls: embedContent.linkMetadata.map(l => l.url),
      paragraphUrls: embedContent.paragraphArticles.map(p => p.url),
      imageAlts: embedContent.imageAlts,
    });
  }
  
  // Build content string with text and embeds
  const contentParts: string[] = [];
  
  if (castText && castText.trim().length > 0) {
    contentParts.push(`Cast text:\n${castText.substring(0, 2000)}${castText.length > 2000 ? "..." : ""}`);
  }
  
  if (embedContent.quotedCastTexts.length > 0) {
    contentParts.push(`\nQuoted casts:\n${embedContent.quotedCastTexts.map((text, i) => `[Quoted cast ${i + 1}]: ${text.substring(0, 500)}${text.length > 500 ? "..." : ""}`).join('\n')}`);
  }
  
  if (embedContent.paragraphArticles.length > 0) {
    const paragraphInfo = embedContent.paragraphArticles.map((article, i) => {
      let info = `[Paragraph Article ${i + 1}]: ${article.url}`;
      if (article.title) info += `\n  Title: ${article.title}`;
      if (article.markdown) {
        // Include first 2000 characters of article content
        const contentPreview = article.markdown.substring(0, 2000);
        info += `\n  Content:\n${contentPreview}${article.markdown.length > 2000 ? "\n[... article continues ...]" : ""}`;
      } else if (article.content) {
        // Strip HTML tags for preview
        const textContent = article.content.replace(/<[^>]+>/g, ' ').substring(0, 2000);
        info += `\n  Content:\n${textContent}${article.content.length > 2000 ? "\n[... article continues ...]" : ""}`;
      }
      return info;
    }).join('\n\n');
    contentParts.push(`\nParagraph Articles:\n${paragraphInfo}`);
  }
  
  if (embedContent.linkMetadata.length > 0) {
    const linkInfo = embedContent.linkMetadata.map((link, i) => {
      let info = `[Link ${i + 1}]: ${link.url}`;
      if (link.title) info += `\n  Title: ${link.title}`;
      if (link.description) info += `\n  Description: ${link.description}`;
      return info;
    }).join('\n');
    contentParts.push(`\nLinks:\n${linkInfo}`);
  }
  
  if (embedContent.hasImageEmbeds) {
    if (embedContent.imageAlts.length > 0) {
      contentParts.push(`\nImages:\n${embedContent.imageAlts.map((alt, i) => `[Image ${i + 1}]: ${alt}`).join('\n')}`);
    } else {
      contentParts.push(`\nImages:\n[Image(s) present but no alt text available]`);
    }
  }
  
  const fullContent = contentParts.join('\n\n');

  // If no content at all, assign defaults
  if (!fullContent || fullContent.trim().length < 10) {
    return {
      qualityScore: 50, // Default middle score
      category: "other",
      reasoning: "No analyzable text or embed content"
    };
  }

  // Detect if this is an image-only cast (no text, only images, no quoted casts, no links, no Paragraph articles)
  const isImageOnly = !hasText && 
                     embedContent.hasImageEmbeds && 
                     embedContent.quotedCastTexts.length === 0 && 
                     embedContent.linkMetadata.length === 0 &&
                     embedContent.paragraphArticles.length === 0;

  const prompt = `Analyze this Farcaster cast and provide:
1. A quality score from 0-100 based on depth, clarity, and value
   - Extremely low-effort content (single emoji, "gm", "lol", "👀", or similar) should be scored between 0 and 5
   - Very short acknowledgements that add only a tiny bit of signal (e.g. "that's fair", "ok true") should typically be scored between 5 and 20
   ${isImageOnly ? `   - IMPORTANT: Image-only casts (no text, only images) should typically be scored between 5 and 30, unless the image is clearly high-effort original art, meaningful visual commentary, or substantial visual content. Most image-only posts without context should score 5-20.` : ''}
   - Reserve scores above 60 for posts with substantial thought, argument, reflection, or original perspective
2. A category from this list: crypto-critique, platform-analysis, creator-economy, art-culture, ai-philosophy, community-culture, life-reflection, market-news, playful, other

Category descriptions:
- crypto-critique: Deep analysis of crypto systems, incentives, token dynamics, ecosystem behaviour, power laws
- platform-analysis: Farcaster/Base/platform governance, UX critiques, design philosophy, ecosystem dynamics
- creator-economy: Creator tokens, artist economics, monetisation models, audience dynamics, brand psychology
- art-culture: Art philosophy, crypto-art exploration, artistic devotion, aesthetic commentary, cultural meaning
- ai-philosophy: AI's impact on creation, society, thinking, productivity; reflections on abundance and inner/outer work
- community-culture: Scenius, scene dynamics, digital/physical community strategy, social tech, cultural patterns
- life-reflection: Deep human insight: life stages, clarity, purpose, meaning, long-term reflection, inner transformation
- market-news: Announcements, event-recaps, links, news highlights, content recovery, lightweight informational posts
- playful: Humour, meme-y content, lists, quips, light takes
- other: Anything that doesn't fit the above categories

${fullContent}

Respond in JSON format:
{
  "qualityScore": <number 0-100>,
  "category": "<one of the categories above>",
  "reasoning": "<brief explanation>"
}`;

  try {
    const response = await fetch(`${DEEPSEEK_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at analyzing social media content quality and categorizing topics. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 200,
        temperature: 0.3, // Lower temperature for more consistent results
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[DeepSeek] API error: ${response.status} ${response.statusText}`,
        errorText
      );
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error("[DeepSeek] No content in API response", data);
      return null;
    }

    // Parse JSON from response (may be wrapped in markdown code blocks)
    let jsonContent = content.trim();
    if (jsonContent.startsWith("```json")) {
      jsonContent = jsonContent.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonContent) as {
      qualityScore?: number;
      category?: string;
      reasoning?: string;
    };

    // Validate and normalize quality score
    let qualityScore = result.qualityScore;
    if (typeof qualityScore !== "number") {
      qualityScore = parseInt(String(qualityScore || "0"), 10);
    }
    if (isNaN(qualityScore) || qualityScore < 0) qualityScore = 0;
    if (qualityScore > 100) qualityScore = 100;

    // Apply simple heuristic adjustments for ultra-short / emoji-only content
    // Only apply these heuristics if there's actual text (not just embeds)
    if (castText && castText.trim().length > 0) {
      const normalizedText = castText.trim();
      const textLength = normalizedText.length;
      const wordCount = normalizedText === "" ? 0 : normalizedText.split(/\s+/).length;
      const hasLettersOrDigits = /[A-Za-z0-9]/.test(normalizedText);

      // Emoji-only or essentially content-free messages should always be very low quality
      if (!hasLettersOrDigits && textLength > 0) {
        qualityScore = Math.min(qualityScore, 5);
      }
      // Very short acknowledgements should be capped to keep separation from high-effort posts
      else if (wordCount > 0 && wordCount <= 3 && textLength <= 30) {
        qualityScore = Math.min(qualityScore, 20);
      }
    }

    // Validate and normalize category
    let category = result.category?.toLowerCase().trim();
    if (!category || !VALID_CATEGORIES.includes(category as Category)) {
      // Try to match partial category names
      const matchedCategory = VALID_CATEGORIES.find((cat) =>
        category?.includes(cat) || cat.includes(category || "")
      );
      category = matchedCategory || "other";
    }

    return {
      qualityScore: Math.round(qualityScore),
      category,
      reasoning: result.reasoning,
    };
  } catch (error: any) {
    console.error("[DeepSeek] Error analyzing cast quality:", error.message);
    return null;
  }
}

/**
 * Analyze cast quality with curator feedback for re-evaluation
 * @param params - Object containing cast text, embedded cast texts, links, curator feedback, and current score
 */
export async function analyzeCastQualityWithFeedback(params: {
  castText: string;
  embeddedCastTexts: string[];
  links: string[];
  curatorFeedback: string;
  currentQualityScore: number;
}): Promise<QualityAnalysisResult | null> {
  if (!DEEPSEEK_API_KEY) {
    console.warn("[DeepSeek] DEEPSEEK_API_KEY not configured, skipping quality analysis");
    return null;
  }

  const { castText, embeddedCastTexts, links, curatorFeedback, currentQualityScore } = params;

  const hasText = castText && castText.trim().length > 0;
  const hasEmbeddedCasts = embeddedCastTexts.length > 0;
  const hasLinks = links.length > 0;

  // Allow analysis even if there's no text, as long as there's embedded casts, links, or curator feedback
  if (!hasText && !hasEmbeddedCasts && !hasLinks) {
    console.warn("[DeepSeek] Cast has no text, embedded casts, or links, skipping analysis");
    return null;
  }

  // Build context string with embedded casts
  let embeddedCastsContext = "";
  if (embeddedCastTexts.length > 0) {
    embeddedCastsContext = "\n\nEmbedded Casts:\n";
    embeddedCastTexts.forEach((text, index) => {
      embeddedCastsContext += `\n--- Embedded Cast ${index + 1} ---\n${text.substring(0, 1000)}${text.length > 1000 ? "..." : ""}\n`;
    });
  }

  // Build links context
  let linksContext = "";
  if (links.length > 0) {
    linksContext = "\n\nLinks:\n";
    links.forEach((url, index) => {
      linksContext += `${index + 1}. ${url}\n`;
    });
  }

  // Build cast text section (handle empty text case)
  const castTextSection = hasText 
    ? `Cast Text:\n${castText.substring(0, 2000)}${castText.length > 2000 ? "..." : ""}`
    : "Cast Text: (No text content - cast may contain only embedded casts or links)";

  const prompt = `You are re-evaluating a cast's quality score based on curator feedback.

Current Quality Score: ${currentQualityScore}/100

Curator Feedback:
${curatorFeedback}

${castTextSection}${embeddedCastsContext}${linksContext}

Please re-analyze the quality considering the curator's feedback. The curator has already curated this cast and is providing specific feedback about why the quality score should change.

Provide:
1. A new quality score from 0-100 based on the curator's feedback and the full context
   - Extremely low-effort content (single emoji, "gm", "lol", "👀", or similar) should be scored between 0 and 5
   - Very short acknowledgements that add only a tiny bit of signal (e.g. "that's fair", "ok true") should typically be scored between 5 and 20
   - Reserve scores above 60 for posts with substantial thought, argument, reflection, or original perspective
2. A category from this list: crypto-critique, platform-analysis, creator-economy, art-culture, ai-philosophy, community-culture, life-reflection, market-news, playful, other
3. Brief reasoning for the new score

Respond in JSON format:
{
  "qualityScore": <number 0-100>,
  "category": "<one of the categories above>",
  "reasoning": "<brief explanation of the new score considering curator feedback>"
}`;

  try {
    const response = await fetch(`${DEEPSEEK_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at analyzing social media content quality and re-evaluating scores based on curator feedback. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[DeepSeek] API error: ${response.status} ${response.statusText}`,
        errorText
      );
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error("[DeepSeek] No content in API response", data);
      return null;
    }

    // Parse JSON from response (may be wrapped in markdown code blocks)
    let jsonContent = content.trim();
    if (jsonContent.startsWith("```json")) {
      jsonContent = jsonContent.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const result = JSON.parse(jsonContent) as {
      qualityScore?: number;
      category?: string;
      reasoning?: string;
    };

    // Validate and normalize quality score
    let qualityScore = result.qualityScore;
    if (typeof qualityScore !== "number") {
      qualityScore = parseInt(String(qualityScore || "0"), 10);
    }
    if (isNaN(qualityScore) || qualityScore < 0) qualityScore = 0;
    if (qualityScore > 100) qualityScore = 100;

    // Validate and normalize category
    let category = result.category?.toLowerCase().trim();
    if (!category || !VALID_CATEGORIES.includes(category as Category)) {
      // Try to match partial category names
      const matchedCategory = VALID_CATEGORIES.find((cat) =>
        category?.includes(cat) || cat.includes(category || "")
      );
      category = matchedCategory || "other";
    }

    console.log(`[DeepSeek] Quality re-analysis completed: score=${qualityScore}, category=${category}, previous=${currentQualityScore}`);

    return {
      qualityScore: Math.round(qualityScore),
      category,
      reasoning: result.reasoning,
    };
  } catch (error: any) {
    console.error("[DeepSeek] Error analyzing cast quality with feedback:", error.message);
    return null;
  }
}

/**
 * Analyze cast quality asynchronously (fire-and-forget)
 * This function doesn't block and handles errors internally
 */
export function analyzeCastQualityAsync(
  castHash: string,
  castData: any,
  updateCallback: (castHash: string, result: QualityAnalysisResult) => Promise<void>
): void {
  // Run in background without blocking - don't await to avoid blocking the response
  (async () => {
    try {
      const result = await analyzeCastQuality(castData);
      if (result) {
        await updateCallback(castHash, result);
      }
    } catch (error: any) {
      console.error(
        `[DeepSeek] Error in async quality analysis for cast ${castHash}:`,
        error.message
      );
    }
  })().catch((error) => {
    console.error(
      `[DeepSeek] Unhandled error in async quality analysis for cast ${castHash}:`,
      error
    );
  });
}

/**
 * Analyze multiple casts in batch with rate limiting
 */
export async function analyzeBatch(
  casts: Array<{ castHash: string; castData: any }>,
  updateCallback: (castHash: string, result: QualityAnalysisResult) => Promise<void>,
  options: {
    batchSize?: number;
    delayBetweenBatches?: number;
  } = {}
): Promise<{ processed: number; failed: number }> {
  const batchSize = options.batchSize || 5;
  const delayMs = options.delayBetweenBatches || 1000; // 1 second default delay

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < casts.length; i += batchSize) {
    const batch = casts.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async ({ castHash, castData }) => {
        try {
          const result = await analyzeCastQuality(castData);
          if (result) {
            await updateCallback(castHash, result);
            processed++;
          } else {
            failed++;
          }
        } catch (error: any) {
          console.error(
            `[DeepSeek] Error analyzing cast ${castHash}:`,
            error.message
          );
          failed++;
        }
      })
    );

    // Rate limiting: wait between batches (except for the last batch)
    if (i + batchSize < casts.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { processed, failed };
}
