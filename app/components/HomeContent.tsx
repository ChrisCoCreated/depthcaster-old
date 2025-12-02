"use client";

import { Feed } from "./Feed";
import { CastComposer } from "./CastComposer";
import { useNeynarContext, useMiniApp, MiniAppProvider } from "@neynar/react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";

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

function HomeContentInner() {
  const router = useRouter();
  const pathname = usePathname();
  const { isSDKLoaded, context } = useMiniApp();

  // Redirect to /miniapp if opened in miniapp context
  useEffect(() => {
    if (isSDKLoaded && context && pathname === "/") {
      router.replace("/miniapp");
    }
  }, [isSDKLoaded, context, pathname, router]);

  return (
    <div className="min-h-screen" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
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

export function HomeContent() {
  return (
    <MiniAppProvider>
      <HomeContentInner />
    </MiniAppProvider>
  );
}
