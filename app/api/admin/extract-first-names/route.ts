import { NextRequest, NextResponse } from "next/server";
import { isSuperAdmin, getUserRoles } from "@/lib/roles";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

interface UserInput {
  fid: number;
  username: string | null;
  displayName: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminFid, users: usersInput } = body;

    if (!adminFid) {
      return NextResponse.json(
        { error: "adminFid is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(usersInput) || usersInput.length === 0) {
      return NextResponse.json(
        { error: "users array is required and must not be empty" },
        { status: 400 }
      );
    }

    const adminFidNum = parseInt(adminFid);
    if (isNaN(adminFidNum)) {
      return NextResponse.json(
        { error: "Invalid adminFid" },
        { status: 400 }
      );
    }

    // Check if user has superadmin role
    const adminUser = await db.select().from(users).where(eq(users.fid, adminFidNum)).limit(1);
    if (adminUser.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    const adminRoles = await getUserRoles(adminFidNum);
    if (!isSuperAdmin(adminRoles)) {
      return NextResponse.json(
        { error: "User does not have superadmin role" },
        { status: 403 }
      );
    }

    // Validate user input
    const validatedUsers: UserInput[] = usersInput.map((u: any) => ({
      fid: parseInt(u.fid),
      username: u.username || null,
      displayName: u.displayName || null,
    })).filter((u) => !isNaN(u.fid));

    if (validatedUsers.length === 0) {
      return NextResponse.json(
        { error: "No valid users provided" },
        { status: 400 }
      );
    }

    // Fallback function: capitalize first letter of username
    const fallbackFirstName = (username: string | null): string => {
      if (!username || username.length === 0) return "User";
      return username.charAt(0).toUpperCase() + username.slice(1);
    };

    // If DeepSeek API is not configured, use fallback
    if (!DEEPSEEK_API_KEY) {
      console.warn("[Extract First Names] DEEPSEEK_API_KEY not configured, using fallback");
      const firstNames = validatedUsers.map((u) => fallbackFirstName(u.username));
      return NextResponse.json({ firstNames });
    }

    // Prepare batch request for DeepSeek
    const userList = validatedUsers.map((u, index) => {
      const username = u.username || `user_${u.fid}`;
      const displayName = u.displayName || "";
      return `${index + 1}. Username: "${username}"${displayName ? `, Display Name: "${displayName}"` : ""}`;
    }).join("\n");

    const prompt = `Extract the first name from each user's username and/or display name. Return ONLY a JSON array of first names, one per user, in the same order. If you cannot determine a first name, return an empty string for that user.

Users:
${userList}

Return format: ["FirstName1", "FirstName2", ...]`;

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
              content: "You are a helpful assistant that extracts first names from usernames and display names. Always return valid JSON arrays only, no explanations.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 2000,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[Extract First Names] DeepSeek API error: ${response.status} ${response.statusText}`,
          errorText
        );
        // Fallback to capitalized usernames
        const firstNames = validatedUsers.map((u) => fallbackFirstName(u.username));
        return NextResponse.json({ firstNames });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.warn("[Extract First Names] No content in DeepSeek response, using fallback");
        const firstNames = validatedUsers.map((u) => fallbackFirstName(u.username));
        return NextResponse.json({ firstNames });
      }

      // Parse JSON response
      let firstNames: string[] = [];
      try {
        // Clean up the response (remove markdown code blocks if present)
        let cleanedContent = content.trim();
        if (cleanedContent.startsWith("```")) {
          cleanedContent = cleanedContent.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
        }
        firstNames = JSON.parse(cleanedContent);
        
        if (!Array.isArray(firstNames)) {
          throw new Error("Response is not an array");
        }
      } catch (parseError) {
        console.warn("[Extract First Names] Failed to parse DeepSeek response, using fallback", parseError);
        const firstNames = validatedUsers.map((u) => fallbackFirstName(u.username));
        return NextResponse.json({ firstNames });
      }

      // Ensure we have the right number of names, use fallback for missing ones
      const finalFirstNames = validatedUsers.map((u, index) => {
        const extractedName = firstNames[index];
        if (extractedName && typeof extractedName === "string" && extractedName.trim().length > 0) {
          return extractedName.trim();
        }
        return fallbackFirstName(u.username);
      });

      return NextResponse.json({ firstNames: finalFirstNames });
    } catch (apiError: any) {
      console.error("[Extract First Names] DeepSeek API error:", apiError.message || apiError);
      // Fallback to capitalized usernames
      const firstNames = validatedUsers.map((u) => fallbackFirstName(u.username));
      return NextResponse.json({ firstNames });
    }
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("[Extract First Names] Error:", err.message || err);
    return NextResponse.json(
      { error: err.message || "Failed to extract first names" },
      { status: 500 }
    );
  }
}

