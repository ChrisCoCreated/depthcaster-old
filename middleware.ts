import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // Handle CORS preflight (OPTIONS) requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const hostname = request.headers.get("host") || "";
  const isDepthcaster = hostname === "depthcaster.com" || hostname === "www.depthcaster.com";
  
  // If on depthcaster.com, only allow miniapp and API routes
  if (isDepthcaster) {
    const pathname = request.nextUrl.pathname;
    
    // Allow miniapp route
    if (pathname === "/miniapp" || pathname.startsWith("/miniapp/")) {
      return NextResponse.next();
    }
    
    // Allow API routes (needed for miniapp functionality)
    if (pathname.startsWith("/api/")) {
      return NextResponse.next();
    }
    
    // Allow .well-known directory (needed for Farcaster and other protocol files)
    if (pathname.startsWith("/.well-known/")) {
      return NextResponse.next();
    }
    
    // Allow static assets (images, icons, manifest, etc.)
    if (
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/images/") ||
      pathname.startsWith("/icon-") ||
      pathname === "/favicon.ico" ||
      pathname === "/manifest.json" ||
      pathname === "/sw.js" ||
      pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$/i)
    ) {
      return NextResponse.next();
    }
    
    // Redirect everything else to sopha.social
    const redirectUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, "https://sopha.social");
    return NextResponse.redirect(redirectUrl, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
