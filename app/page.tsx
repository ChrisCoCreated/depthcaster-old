"use client";

import { Feed } from "./components/Feed";
import { CastComposer } from "./components/CastComposer";
import { useNeynarContext } from "@neynar/react";

export default function Home() {
  const { user } = useNeynarContext();

  return (
    <div className="min-h-screen">
      {/* Main content */}
      <main className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="flex gap-4 sm:gap-8">
          {/* Feed */}
          <div className="flex-1 min-w-0">
            {user && (
              <div className="mb-4 sm:mb-6">
                <CastComposer />
              </div>
            )}
            <Feed viewerFid={user?.fid} />
          </div>
        </div>
      </main>
    </div>
  );
}
