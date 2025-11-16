import { NextRequest, NextResponse } from "next/server";
import { proxyRemoteImage, sanitizeImageUrl, shouldProxyImageUrl } from "@/lib/imageProxy";

const ERROR_RESPONSE = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

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
      return ERROR_RESPONSE(`Upstream request failed (${upstream.status})`, upstream.status);
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Depthcaster-Image-Proxy": "1",
        "X-Depthcaster-Proxy-Source": sanitized,
      },
    });
  } catch (error) {
    console.error("Image proxy error:", error);
    return ERROR_RESPONSE("Failed to fetch remote image", 502);
  }
}

