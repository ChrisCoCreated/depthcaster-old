/**
 * DeepSeek API integration for cast quality analysis and categorization
 */

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export interface QualityAnalysisResult {
  qualityScore: number;
  category: string;
  reasoning?: string;
}

const VALID_CATEGORIES = [
  "technical",
  "philosophy",
  "art",
  "discussion",
  "question",
  "announcement",
  "opinion",
  "tutorial",
  "news",
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
  if (!castText || castText.trim().length === 0) {
    console.warn("[DeepSeek] Cast has no text, skipping analysis");
    return null;
  }

  const prompt = `Analyze this Farcaster cast and provide:
1. A quality score from 0-100 based on depth, clarity, and value
2. A category from this list: technical, philosophy, art, discussion, question, announcement, opinion, tutorial, news, other

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
