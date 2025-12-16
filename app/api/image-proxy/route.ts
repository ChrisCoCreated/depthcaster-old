import { NextRequest, NextResponse } from "next/server";
import { proxyRemoteImage, sanitizeImageUrl, shouldProxyImageUrl } from "@/lib/imageProxy";

// Return a 1x1 transparent PNG when image can't be loaded
// This ensures Next.js Image component recognizes it as a failed load
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const ERROR_RESPONSE = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

// Return a 404 with transparent PNG - Next.js Image will definitely treat this as a failed load
// Using 404 instead of 502 because Next.js Image handles 404s better
const IMAGE_ERROR_RESPONSE = () =>
  new NextResponse(TRANSPARENT_PNG, {
    status: 404,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Sopha-Image-Error": "1",
    },
  });

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");

  if (!target) {
    return ERROR_RESPONSE("Missing url parameter");
  }

  const sanitized = sanitizeImageUrl(target);

  if (!sanitized) {
    return ERROR_RESPONSE("Invalid URL");
  }

  if (!shouldProxyImageUrl(sanitized)) {
    return ERROR_RESPONSE("Host is not allowed for proxying", 403);
  }

  try {
    const upstream = await proxyRemoteImage(sanitized);

    if (!upstream.ok) {
      return IMAGE_ERROR_RESPONSE();
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    
    // Reject HTML responses (Imgur returns HTML error pages for region-blocked content)
    if (contentType.startsWith("text/html")) {
      return IMAGE_ERROR_RESPONSE();
    }

    // Only accept image content types
    if (!contentType.startsWith("image/")) {
      return IMAGE_ERROR_RESPONSE();
    }

    const buffer = await upstream.arrayBuffer();

    // Additional check: if the buffer looks like HTML (even if content-type says image)
    const textDecoder = new TextDecoder();
    const preview = textDecoder.decode(buffer.slice(0, 200));
    const lowerPreview = preview.trim().toLowerCase();
    if (
      lowerPreview.startsWith("<!doctype") ||
      lowerPreview.startsWith("<html") ||
      lowerPreview.includes("content not viewable") ||
      lowerPreview.includes("not available in your region")
    ) {
      return IMAGE_ERROR_RESPONSE();
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Sopha-Image-Proxy": "1",
        "X-Sopha-Proxy-Source": sanitized,
      },
    });
  } catch (error) {
    console.error("Image proxy error:", error);
    return IMAGE_ERROR_RESPONSE();
  }
}

