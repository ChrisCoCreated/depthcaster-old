import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure XMTP browser SDK only runs on client side
  serverExternalPackages: [
    '@xmtp/browser-sdk',
    'thread-stream',
    'pino',
    'pino-pretty',
    '@walletconnect/logger',
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Externalize Node-only packages from client bundle
      config.resolve.alias = {
        ...config.resolve.alias,
        "thread-stream": false,
        "pino": false,
        "pino-pretty": false,
        "@walletconnect/logger": false,
      };
      // Also mark as externals to prevent bundling
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('thread-stream', 'pino', 'pino-pretty', '@walletconnect/logger');
      }
    }
    return config;
  },
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
