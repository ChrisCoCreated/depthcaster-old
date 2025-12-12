import { NextRequest, NextResponse } from "next/server";

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text parameter is required" },
        { status: 400 }
      );
    }

    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json(
        { error: "DeepSeek API key not configured" },
        { status: 500 }
      );
    }

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
            content: "You are a professional translator. Translate the given text to English. Preserve the original formatting, line breaks, and structure. Only return the translated text, no explanations or additional text.",
          },
          {
            role: "user",
            content: `Translate the following text to English:\n\n${text}`,
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[DeepSeek Translation] API error: ${response.status} ${response.statusText}`,
        errorText
      );
      return NextResponse.json(
        { error: "Translation failed" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content;

    if (!translatedText) {
      console.error("[DeepSeek Translation] No content in API response", data);
      return NextResponse.json(
        { error: "No translation received" },
        { status: 500 }
      );
    }

    // Clean up the response (remove markdown code blocks if present)
    let cleanedText = translatedText.trim();
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
    }

    return NextResponse.json({ translatedText: cleanedText });
  } catch (error: any) {
    console.error("[DeepSeek Translation] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Translation failed" },
      { status: 500 }
    );
  }
}







