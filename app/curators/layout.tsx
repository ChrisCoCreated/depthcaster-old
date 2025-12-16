import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Curator Guide - Sopha",
  description: "Guide for curators on Sopha. Learn how to curate casts and surface thoughtful conversations on Farcaster.",
  openGraph: {
    type: "website",
    title: "Curator Guide - Sopha",
    description: "How to curate casts on Sopha. Help surface the best conversations on Farcaster.",
    url: "/curators",
    siteName: "Sopha",
    images: [
      {
        url: "/icon-512x512.webp?v=2",
        width: 512,
        height: 512,
        alt: "Sopha",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Curator Guide - Sopha",
    description: "Guide for curators on Sopha. Learn how to curate casts and surface thoughtful conversations on Farcaster.",
    images: ["/icon-512x512.webp?v=2"],
  },
};

export default function CuratorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

