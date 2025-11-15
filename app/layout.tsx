import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { Header } from "./components/Header";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";
import { OnboardingFlow } from "./components/OnboardingFlow";
import { PushSubscriptionManager } from "./components/PushSubscriptionManager";

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

export const metadata: Metadata = {
  title: "Depthcaster - Deep Thoughts on Farcaster",
  description: "A Farcaster client focused on philosophy, art, and meaningful conversations",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-48x48.webp", sizes: "48x48", type: "image/webp" },
      { url: "/icon-72x72.webp", sizes: "72x72", type: "image/webp" },
      { url: "/icon-96x96.webp", sizes: "96x96", type: "image/webp" },
      { url: "/icon-128x128.webp", sizes: "128x128", type: "image/webp" },
      { url: "/icon-144x144.webp", sizes: "144x144", type: "image/webp" },
      { url: "/icon-152x152.webp", sizes: "152x152", type: "image/webp" },
      { url: "/icon-192x192.webp", sizes: "192x192", type: "image/webp" },
      { url: "/icon-256x256.webp", sizes: "256x256", type: "image/webp" },
      { url: "/icon-384x384.webp", sizes: "384x384", type: "image/webp" },
      { url: "/icon-512x512.webp", sizes: "512x512", type: "image/webp" },
    ],
    apple: [
      { url: "/icon-152x152.webp", sizes: "152x152", type: "image/webp" },
      { url: "/icon-192x192.webp", sizes: "192x192", type: "image/webp" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Depthcaster",
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
        <ServiceWorkerRegistration />
        <AuthProvider>
          <PushSubscriptionManager />
          <OnboardingFlow />
          <Header />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
