import type { Metadata } from "next";
import { HomeContent } from "./components/HomeContent";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sopha.social";

export const metadata: Metadata = {
  other: {
    "fc:miniapp": JSON.stringify({
      version: "1",
      imageUrl: `${appUrl}/icon-512x512.webp?v=2`,
      button: {
        title: "Open Sopha",
        action: {
          type: "launch_frame",
          name: "Sopha",
          url: `${appUrl}/miniapp`,
          splashImageUrl: `${appUrl}/icon-512x512.webp?v=2`,
          splashBackgroundColor: "#000000",
        },
      },
      castShareUrl: `${appUrl}/share`,
    }),
  },
};

export default function Home() {
  return <HomeContent />;
}
