/**
 * DeepSeek API integration for cast quality analysis and categorization
 */

import { db } from "@/lib/db";
import { curatedCasts, castReplies } from "@/lib/schema";
import { extractQuotedCastHashes } from "@/lib/conversation";
import { eq } from "drizzle-orm";

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
 * Check if cast is a pure recast (has embeds with cast but minimal/no text)
 */
function isPureRecast(castData: any, castText: string): boolean {
  if (!castData) return false;
  
  // Check if cast has embeds with cast_id or cast (indicating it's a quote/recast)
  const hasCastEmbed = castData.embeds?.some((embed: any) => 
    embed.cast_id || (embed.cast && embed.cast.hash)
  ) || false;
  
  if (!hasCastEmbed) return false;
  
  // If it has a cast embed but minimal/no text, it's a pure recast
  const normalizedText = castText.trim();
  const textLength = normalizedText.length;
  const wordCount = normalizedText === "" ? 0 : normalizedText.split(/\s+/).filter(w => w.length > 0).length;
  
  // Pure recast: has cast embed but no meaningful text (empty or just whitespace/emoji)
  return textLength === 0 || (wordCount === 0 && textLength <= 5);
}

/**
 * Analyze a single cast for quality and category using DeepSeek API
 */
export async function analyzeCastQuality(
  castData: any
): Promise<QualityAnalysisResult | null> {
  if (!DEEPSEEK_API_KEY) {
    console.warn("[DeepSeek] DEEPSEEK_API_KEY not configured, skipping quality analysis");
    return null;
  }

  const castText = extractCastText(castData);
  
  // Check if this is a pure recast (quote cast with no additional text)
  if (isPureRecast(castData, castText)) {
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
          })
          .from(curatedCasts)
          .where(eq(curatedCasts.castHash, quotedCastHash))
          .limit(1);
        
        if (curatedCast.length > 0 && curatedCast[0].qualityScore !== null) {
          const originalScore = curatedCast[0].qualityScore;
          const adjustedScore = Math.max(0, originalScore - 10);
          console.log(`[DeepSeek] Pure recast detected, using original score ${originalScore} - 10 = ${adjustedScore}`);
          return {
            qualityScore: adjustedScore,
            category: curatedCast[0].category || "other",
            reasoning: `Pure recast scored as original (${originalScore}) minus 10`,
          };
        }
        
        // If not found in curatedCasts, check castReplies table
        const castReply = await db
          .select({
            qualityScore: castReplies.qualityScore,
            category: castReplies.category,
          })
          .from(castReplies)
          .where(eq(castReplies.replyCastHash, quotedCastHash))
          .limit(1);
        
        if (castReply.length > 0 && castReply[0].qualityScore !== null) {
          const originalScore = castReply[0].qualityScore;
          const adjustedScore = Math.max(0, originalScore - 10);
          console.log(`[DeepSeek] Pure recast detected, using original score ${originalScore} - 10 = ${adjustedScore}`);
          return {
            qualityScore: adjustedScore,
            category: castReply[0].category || "other",
            reasoning: `Pure recast scored as original (${originalScore}) minus 10`,
          };
        }
      } catch (error: any) {
        console.error(`[DeepSeek] Error looking up original cast quality score:`, error.message);
        // Fall through to default behavior
      }
      
      // If original cast not found or not analyzed yet, return default low score
      console.warn(`[DeepSeek] Pure recast detected but original cast ${quotedCastHash} not found or not analyzed, using default score`);
      return {
        qualityScore: 5,
        category: "other",
        reasoning: "Pure recast with no original cast quality score available",
      };
    }
  }
  
  if (!castText || castText.trim().length === 0) {
    console.warn("[DeepSeek] Cast has no text, skipping analysis");
    return null;
  }

  const prompt = `Analyze this Farcaster cast and provide:
1. A quality score from 0-100 based on depth, clarity, and value
   - Extremely low-effort content (single emoji, "gm", "lol", "👀", or similar) should be scored between 0 and 5
   - Very short acknowledgements that add only a tiny bit of signal (e.g. "that's fair", "ok true") should typically be scored between 5 and 20
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

Cast text:
${castText.substring(0, 2000)}${castText.length > 2000 ? "..." : ""}

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
