import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const isDepthcaster = hostname === "depthcaster.com" || hostname === "www.depthcaster.com";
  
  if (!isDepthcaster) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  
  // Allow miniapp route
  if (pathname === "/miniapp" || pathname.startsWith("/miniapp/")) {
    return NextResponse.next();
  }
  
  // Allow API routes (only required miniapp routes will exist)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  
  // Allow .well-known directory (for Farcaster protocol)
  if (pathname.startsWith("/.well-known/")) {
    return NextResponse.next();
  }
  
  // Allow static assets
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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
