import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Curator Guide - Depthcaster",
  description: "Guide for curators on Depthcaster. Learn how to curate casts and surface thoughtful conversations on Farcaster.",
  openGraph: {
    type: "website",
    title: "Curator Guide - Depthcaster",
    description: "How to curate casts on Depthcaster. Help surface the best conversations on Farcaster.",
    url: "/curators",
    siteName: "Depthcaster",
    images: [
      {
        url: "/icon-512x512.webp",
        width: 512,
        height: 512,
        alt: "Depthcaster",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Curator Guide - Depthcaster",
    description: "Guide for curators on Depthcaster. Learn how to curate casts and surface thoughtful conversations on Farcaster.",
    images: ["/icon-512x512.webp"],
  },
};

export default function CuratorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

