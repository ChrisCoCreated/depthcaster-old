import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

export async function GET(request: NextRequest) {
  try {
    const updatesDir = join(process.cwd(), "docs", "updates");
    
    // Read all files in the updates directory
    const files = await readdir(updatesDir);
    
    // Filter for update-*.md files and sort by number (lower numbers = newer)
    const updateFiles = files
      .filter((file) => file.match(/^update-\d+\.md$/))
      .sort((a, b) => {
        const numA = parseInt(a.match(/update-(\d+)\.md$/)?.[1] || "0");
        const numB = parseInt(b.match(/update-(\d+)\.md$/)?.[1] || "0");
        return numA - numB; // Lower numbers first (newest first)
      });
    
    if (updateFiles.length === 0) {
      return NextResponse.json(
        { error: "No update files found" },
        { status: 404 }
      );
    }
    
    // Read all update files and combine them
    const contents = await Promise.all(
      updateFiles.map((file) =>
        readFile(join(updatesDir, file), "utf-8")
      )
    );
    
    // Combine all updates with separators
    const combinedContent = contents.join("\n\n---\n\n");
    
    return NextResponse.json({ content: combinedContent });
  } catch (error: any) {
    console.error("Error reading features update files:", error);
    return NextResponse.json(
      { error: "Failed to load features update" },
      { status: 500 }
    );
  }
}

