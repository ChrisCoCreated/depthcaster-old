import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy Paragraph API route - proxies to unified blog API
 * Kept for backward compatibility
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const url = searchParams.get("url");
  
  // Proxy to unified blog API
  const baseUrl = request.nextUrl.origin;
  const blogApiUrl = `${baseUrl}/api/blog?url=${encodeURIComponent(url || '')}`;
  
  console.log('[Paragraph API] Proxying to blog API:', blogApiUrl);
  
  try {
    // Forward the request to the blog API
    const response = await fetch(blogApiUrl, {
      method: "GET",
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Paragraph API] Error proxying to blog API:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

