import type { Metadata } from "next";
import { HomeContent } from "./components/HomeContent";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://depthcaster.com";

export const metadata: Metadata = {
  other: {
    "fc:miniapp": JSON.stringify({
      version: "1",
      imageUrl: `${appUrl}/icon-512x512.webp`,
      button: {
        title: "Open Depthcaster",
        action: {
          type: "launch_frame",
          name: "Depthcaster",
          url: `${appUrl}/miniapp`,
          splashImageUrl: `${appUrl}/icon-512x512.webp`,
          splashBackgroundColor: "#000000",
        },
      },
    }),
  },
};

export default function Home() {
  return <HomeContent />;
}
