import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#000000",
};

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Sopha - Deep Social on Farcaster",
  description: "A Long from farcaster client focused on philosophy, art, and meaningful conversations",
  keywords: ["Farcaster", "social media", "philosophy", "art", "conversations", "web3", "decentralized"],
  authors: [{ name: "Sopha" }],
  creator: "Sopha",
  publisher: "Sopha",
  manifest: "/manifest.json",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.vercel.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Sopha",
    title: "Sopha - Deep Social on Farcaster",
    description: "A Long from farcaster client focused on philosophy, art, and meaningful conversations",
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
    title: "Sopha - Deep Social on Farcaster",
    description: "A Long from farcaster client focused on deep social, philosophy, art, and meaningful conversations",
    images: ["/icon-512x512.webp?v=2"],
    creator: "@sopha_social",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-48x48.webp?v=2", sizes: "48x48", type: "image/webp" },
      { url: "/icon-72x72.webp?v=2", sizes: "72x72", type: "image/webp" },
      { url: "/icon-96x96.webp?v=2", sizes: "96x96", type: "image/webp" },
      { url: "/icon-128x128.webp?v=2", sizes: "128x128", type: "image/webp" },
      { url: "/icon-144x144.webp?v=2", sizes: "144x144", type: "image/webp" },
      { url: "/icon-152x152.webp?v=2", sizes: "152x152", type: "image/webp" },
      { url: "/icon-192x192.webp?v=2", sizes: "192x192", type: "image/webp" },
      { url: "/icon-256x256.webp?v=2", sizes: "256x256", type: "image/webp" },
      { url: "/icon-384x384.webp?v=2", sizes: "384x384", type: "image/webp" },
      { url: "/icon-512x512.webp?v=2", sizes: "512x512", type: "image/webp" },
    ],
    apple: [
      { url: "/icon-192x192.webp?v=2", sizes: "192x192", type: "image/webp" },
      { url: "/icon-152x152.webp?v=2", sizes: "152x152", type: "image/webp" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sopha",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white dark:bg-black text-gray-900 dark:text-gray-100`}
      >
        <Analytics />
        {children}
      </body>
    </html>
  );
}
