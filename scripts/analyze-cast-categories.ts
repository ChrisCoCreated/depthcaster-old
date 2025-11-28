/**
 * Script to analyze existing curated casts and suggest improved category list
 * 
 * Usage:
 *   npx tsx scripts/analyze-cast-categories.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local or .env
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../lib/db";
import { curatedCasts } from "../lib/schema";

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

interface CategorySuggestion {
  suggestedCategory: string;
  reasoning: string;
}

/**
 * Extract cast text from cast data
 */
function extractCastText(castData: any): string {
  if (!castData) return "";
  return castData.text || castData.cast?.text || "";
}

/**
 * Get category suggestion from DeepSeek for a single cast
 */
async function getCategorySuggestion(castText: string): Promise<CategorySuggestion | null> {
  if (!DEEPSEEK_API_KEY) {
    console.warn("[Category Analysis] DEEPSEEK_API_KEY not configured");
    return null;
  }

  if (!castText || castText.trim().length === 0) {
    return null;
  }

  const prompt = `Analyze this Farcaster cast and suggest a specific category name that best describes its topic/content type.

Current categories we use: technical, philosophy, art, discussion, question, announcement, opinion, tutorial, news, other

Cast text:
${castText.substring(0, 2000)}${castText.length > 2000 ? "..." : ""}

Please suggest:
1. A specific category name (can be from the list above, or suggest a new one if none fit well)
2. Brief reasoning for why this category fits

Respond in JSON format:
{
  "suggestedCategory": "<category name>",
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
              "You are an expert at categorizing social media content. Always respond with valid JSON only. Suggest specific, useful category names.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 150,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Category Analysis] API error: ${response.status} ${response.statusText}`,
        errorText
      );
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
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
      suggestedCategory?: string;
      reasoning?: string;
    };

    return {
      suggestedCategory: result.suggestedCategory?.toLowerCase().trim() || "other",
      reasoning: result.reasoning || "",
    };
  } catch (error: any) {
    console.error("[Category Analysis] Error getting suggestion:", error.message);
    return null;
  }
}

/**
 * Analyze all curated casts and generate category recommendations
 */
async function analyzeCastCategories() {
  console.log("Starting category analysis for curated casts...\n");

  if (!DEEPSEEK_API_KEY) {
    console.error("❌ DEEPSEEK_API_KEY not configured. Please set it in .env.local");
    process.exit(1);
  }

  try {
    // Get all curated casts
    const allCasts = await db
      .select({
        castHash: curatedCasts.castHash,
        castData: curatedCasts.castData,
        category: curatedCasts.category,
      })
      .from(curatedCasts);

    console.log(`Found ${allCasts.length} curated cast(s)\n`);

    if (allCasts.length === 0) {
      console.log("No casts to analyze. Exiting.");
      return;
    }

    // Limit to first 50 casts for analysis (to avoid too many API calls)
    const castsToAnalyze = allCasts.slice(0, 50);
    if (allCasts.length > 50) {
      console.log(`Analyzing first 50 casts (out of ${allCasts.length} total)\n`);
    }

    // Track category suggestions
    const categoryCounts = new Map<string, number>();
    const categoryExamples = new Map<string, Array<{ castHash: string; text: string; reasoning: string }>>();
    const currentCategoryCounts = new Map<string, number>();

    // Count current categories if any
    allCasts.forEach((cast) => {
      if (cast.category) {
        const count = currentCategoryCounts.get(cast.category) || 0;
        currentCategoryCounts.set(cast.category, count + 1);
      }
    });

    let processed = 0;
    let failed = 0;

    // Analyze each cast
    for (let i = 0; i < castsToAnalyze.length; i++) {
      const cast = castsToAnalyze[i];
      const castText = extractCastText(cast.castData);
      
      if (!castText || castText.trim().length === 0) {
        console.log(`[${i + 1}/${castsToAnalyze.length}] Skipping cast ${cast.castHash.substring(0, 10)}... (no text)`);
        continue;
      }

      console.log(`[${i + 1}/${castsToAnalyze.length}] Analyzing cast ${cast.castHash.substring(0, 10)}...`);
      
      const suggestion = await getCategorySuggestion(castText);
      
      if (suggestion) {
        const category = suggestion.suggestedCategory;
        const count = categoryCounts.get(category) || 0;
        categoryCounts.set(category, count + 1);

        // Store example
        if (!categoryExamples.has(category)) {
          categoryExamples.set(category, []);
        }
        const examples = categoryExamples.get(category)!;
        if (examples.length < 3) {
          examples.push({
            castHash: cast.castHash,
            text: castText.substring(0, 100) + (castText.length > 100 ? "..." : ""),
            reasoning: suggestion.reasoning,
          });
        }

        processed++;
        console.log(`  → Suggested: ${category}`);
      } else {
        failed++;
        console.log(`  → Failed to get suggestion`);
      }

      // Rate limiting: small delay between requests
      if (i < castsToAnalyze.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Generate report
    console.log("\n" + "=".repeat(80));
    console.log("CATEGORY ANALYSIS REPORT");
    console.log("=".repeat(80));

    console.log("\n📊 Current Category Usage (all casts):");
    if (currentCategoryCounts.size === 0) {
      console.log("  No casts have categories assigned yet.");
    } else {
      const sortedCurrent = Array.from(currentCategoryCounts.entries())
        .sort((a, b) => b[1] - a[1]);
      sortedCurrent.forEach(([category, count]) => {
        const percentage = ((count / allCasts.length) * 100).toFixed(1);
        console.log(`  ${category}: ${count} (${percentage}%)`);
      });
    }

    console.log("\n🔍 Suggested Categories (from analyzed casts):");
    const sortedCategories = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    sortedCategories.forEach(([category, count]) => {
      const percentage = ((count / processed) * 100).toFixed(1);
      console.log(`\n  ${category}: ${count} casts (${percentage}%)`);
      const examples = categoryExamples.get(category) || [];
      if (examples.length > 0) {
        console.log(`    Examples:`);
        examples.forEach((ex, idx) => {
          console.log(`      ${idx + 1}. ${ex.text}`);
          if (ex.reasoning) {
            console.log(`         Reasoning: ${ex.reasoning}`);
          }
        });
      }
    });

    // Identify new categories not in current list
    const currentCategories = ["technical", "philosophy", "art", "discussion", "question", "announcement", "opinion", "tutorial", "news", "other"];
    const newCategories = sortedCategories
      .filter(([cat]) => !currentCategories.includes(cat))
      .map(([cat]) => cat);

    if (newCategories.length > 0) {
      console.log("\n✨ New Categories Suggested (not in current list):");
      newCategories.forEach((cat) => {
        const count = categoryCounts.get(cat) || 0;
        console.log(`  - ${cat} (${count} casts)`);
      });
    }

    // Recommend final category list
    console.log("\n💡 Recommended Category List:");
    console.log("   Based on the analysis, here's a suggested improved category list:");
    
    // Include top categories from suggestions, plus keep useful current ones
    const recommendedCategories: string[] = [];
    
    // Add top suggested categories (at least 2 occurrences)
    sortedCategories
      .filter(([_, count]) => count >= 2)
      .forEach(([cat]) => {
        if (!recommendedCategories.includes(cat)) {
          recommendedCategories.push(cat);
        }
      });

    // Add current categories that might still be useful
    currentCategories.forEach((cat) => {
      if (!recommendedCategories.includes(cat)) {
        // Keep if it was suggested or if it's a general category like "other"
        if (categoryCounts.has(cat) || cat === "other" || cat === "discussion") {
          recommendedCategories.push(cat);
        }
      }
    });

    // Sort alphabetically for consistency
    recommendedCategories.sort();

    console.log(`\n   const VALID_CATEGORIES = [`);
    recommendedCategories.forEach((cat, idx) => {
      const comma = idx < recommendedCategories.length - 1 ? "," : "";
      console.log(`     "${cat}"${comma}`);
    });
    console.log(`   ] as const;`);

    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total casts in database: ${allCasts.length}`);
    console.log(`Casts analyzed: ${processed}`);
    console.log(`Failed analyses: ${failed}`);
    console.log(`Unique categories suggested: ${categoryCounts.size}`);
    console.log(`New categories found: ${newCategories.length}`);
    console.log("\n✅ Analysis complete!");
  } catch (error: any) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

analyzeCastCategories()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
