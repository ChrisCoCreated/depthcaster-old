"use client";

import { CastThread } from "../components/CastThread";
import { useNeynarContext } from "@neynar/react";

const CAST_HASH = "0x9f4c65bc671c2bd4c2d179e2671c9dd24707771c";

export default function WhyPage() {
  const { user } = useNeynarContext();

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <CastThread castHash={CAST_HASH} viewerFid={user?.fid} />
      </main>
    </div>
  );
}
