import { NextRequest, NextResponse } from "next/server";
import { upsertUser } from "@/lib/users";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fid } = body;

    if (!fid || typeof fid !== "number") {
      return NextResponse.json(
        { error: "fid is required and must be a number" },
        { status: 400 }
      );
    }

    // Upsert the user - this will create the record if it doesn't exist
    await upsertUser(fid);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error ensuring user exists:", error);
    return NextResponse.json(
      { error: error.message || "Failed to ensure user exists" },
      { status: 500 }
    );
  }
}









