import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure XMTP browser SDK only runs on client side
  serverExternalPackages: ['@xmtp/browser-sdk'],
  images: {
    localPatterns: [
      {
        pathname: "/api/image-proxy",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/favicon.png",
        destination: "/favicon.ico",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/icon-:size.webp",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
