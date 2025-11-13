"use client";

import { Feed } from "./components/Feed";
import { CastComposer } from "./components/CastComposer";
import { useNeynarContext } from "@neynar/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function FeedContent() {
  const { user } = useNeynarContext();
  const searchParams = useSearchParams();
  const feedType = searchParams.get("feed") as "curated" | "trending" | "for-you" | "following" | null;

  return (
    <>
      {user && (
        <div className="mb-4 sm:mb-6">
          <CastComposer />
        </div>
      )}
      <Feed viewerFid={user?.fid} initialFeedType={feedType || "curated"} />
    </>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Main content */}
      <main className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="flex gap-4 sm:gap-8">
          {/* Feed */}
          <div className="flex-1 min-w-0">
            <Suspense fallback={<div>Loading...</div>}>
              <FeedContent />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
