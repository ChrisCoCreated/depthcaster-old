"use client";

import { CastThread } from "../../components/CastThread";
import { CastComposer } from "../../components/CastComposer";
import { useNeynarContext } from "@neynar/react";
import { use } from "react";

export default function CastDetailPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = use(params);
  const { user } = useNeynarContext();

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <CastThread castHash={hash} viewerFid={user?.fid} />
        
        {user && (
          <div className="mt-8">
            <CastComposer parentHash={hash} />
          </div>
        )}
      </main>
    </div>
  );
}

