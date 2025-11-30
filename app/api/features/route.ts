import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET(request: NextRequest) {
  try {
    const filePath = join(process.cwd(), "FEATURES_UPDATE.md");
    const content = await readFile(filePath, "utf-8");
    
    return NextResponse.json({ content });
  } catch (error: any) {
    console.error("Error reading features update file:", error);
    return NextResponse.json(
      { error: "Failed to load features update" },
      { status: 500 }
    );
  }
}

