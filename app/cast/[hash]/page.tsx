"use client";

import { CastThread } from "../../components/CastThread";
import { CastComposer } from "../../components/CastComposer";
import { useNeynarContext } from "@neynar/react";
import { use, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

export default function CastDetailPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = use(params);
  const { user } = useNeynarContext();
  const searchParams = useSearchParams();
  const composerRef = useRef<HTMLDivElement>(null);
  const shouldAutoFocus = searchParams.get("reply") === "true";

  useEffect(() => {
    if (shouldAutoFocus && composerRef.current && user) {
      // Scroll to composer and focus the textarea
      setTimeout(() => {
        composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        const textarea = composerRef.current?.querySelector("textarea");
        if (textarea) {
          textarea.focus();
        }
      }, 300); // Small delay to ensure component is rendered
    }
  }, [shouldAutoFocus, user]);

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <CastThread castHash={hash} viewerFid={user?.fid} />
        
        {user && (
          <div ref={composerRef} className="mt-8">
            <CastComposer parentHash={hash} />
          </div>
        )}
      </main>
    </div>
  );
}

