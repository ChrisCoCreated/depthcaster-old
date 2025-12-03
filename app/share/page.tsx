"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MiniAppProvider, useMiniApp } from "@neynar/react";
import { AvatarImage } from "@/app/components/AvatarImage";
import { analytics } from "@/lib/analytics";

const ADMIN_FID = 5701;

function ShareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isSDKLoaded, context } = useMiniApp();
  
  const [castData, setCastData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isCurator, setIsCurator] = useState<boolean | null>(null);
  const [checkingCurator, setCheckingCurator] = useState(false);
  const [isPasting, setIsPasting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCheckedShare, setHasCheckedShare] = useState(false);
  const [mounted, setMounted] = useState(false);

  const farcasterDmLink = context?.user?.fid 
    ? `https://farcaster.xyz/~/inbox/${context.user.fid}-${ADMIN_FID}`
    : `https://farcaster.xyz/~/inbox/${ADMIN_FID}`;

  const checkCuratorStatus = async (): Promise<boolean> => {
    if (!context?.user?.fid) return false;
    
    if (isCurator !== null) {
      return isCurator;
    }

    try {
      setCheckingCurator(true);
      const response = await fetch(`/api/admin/check?fid=${context.user.fid}`);
      if (response.ok) {
        const data = await response.json();
        const roles = data.roles || [];
        const hasCuratorRole = roles.includes("curator");
        setIsCurator(hasCuratorRole);
        return hasCuratorRole;
      }
      setIsCurator(false);
      return false;
    } catch (error) {
      console.error("Failed to check curator status:", error);
      setIsCurator(false);
      return false;
    } finally {
      setCheckingCurator(false);
    }
  };

  const fetchCast = async (castHash: string) => {
    try {
      setLoading(true);
      setError(null);

      // Fetch cast data using Neynar
      const conversationResponse = await fetch(
        `/api/conversation?identifier=${encodeURIComponent(castHash)}&type=hash&replyDepth=0`
      );

      if (!conversationResponse.ok) {
        throw new Error("Failed to fetch cast data");
      }

      const conversationData = await conversationResponse.json();
      const fetchedCastData = conversationData?.conversation?.cast;

      if (!fetchedCastData) {
        throw new Error("Cast not found");
      }

      setCastData(fetchedCastData);
      
      // Check curator status after fetching cast
      await checkCuratorStatus();
    } catch (error: any) {
      console.error("Error fetching cast:", error);
      setError(error.message || "Failed to fetch cast");
    } finally {
      setLoading(false);
    }
  };

  // Set mounted to true on client side to prevent flicker
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle share extension context
  useEffect(() => {
    // Only check once
    if (hasCheckedShare || !mounted) return;

    // Check URL params for castHash (from share extension redirect)
    const castHashFromUrl = searchParams.get("castHash");
    if (castHashFromUrl) {
      setHasCheckedShare(true);
      fetchCast(castHashFromUrl);
      return;
    }

    // Check SDK context for cast_share location type (available after SDK loads)
    if (isSDKLoaded && context) {
      // Check if context has location info (Neynar wrapper may expose this differently)
      const location = (context as any).location;
      if (location?.type === "cast_share" && location?.cast?.hash) {
        setHasCheckedShare(true);
        // Use enriched cast data from SDK if available
        const castData = location.cast;
        setCastData(castData);
        setLoading(false);
        // Check curator status
        checkCuratorStatus();
        return;
      }
    }

    // If no castHash found and SDK is loaded, redirect to miniapp
    if (!castHashFromUrl && isSDKLoaded) {
      router.replace("/miniapp");
    }
  }, [mounted, isSDKLoaded, context, searchParams, hasCheckedShare, router]);

  const handleCancel = () => {
    router.push("/miniapp");
  };

  const handleCurate = async () => {
    if (!context?.user?.fid || !castData || isPasting) return;

    try {
      setIsPasting(true);
      const castHash = castData.hash;

      // Curate the cast
      const curateResponse = await fetch("/api/curate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          castHash,
          curatorFid: context.user.fid,
          castData: castData,
        }),
      });

      if (!curateResponse.ok) {
        const errorData = await curateResponse.json();
        if (curateResponse.status === 403) {
          setError("You don't have permission to curate casts");
        } else if (curateResponse.status === 409) {
          setError("This cast is already curated");
        } else {
          setError(errorData.error || "Failed to curate cast");
        }
        return;
      }

      // Success - track analytics and navigate to feed
      analytics.trackCuratePaste(castHash, context.user.fid);
      router.push("/miniapp");
    } catch (error: any) {
      console.error("Curate error:", error);
      setError(error.message || "Failed to curate cast");
    } finally {
      setIsPasting(false);
    }
  };

  // Don't render anything until mounted to prevent flicker
  if (!mounted || loading || checkingCurator) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error && !castData) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="text-red-600 dark:text-red-400 mb-4">{error}</div>
          <button
            onClick={handleCancel}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Go to Feed
          </button>
        </div>
      </div>
    );
  }

  if (!castData) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">No cast found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Curate this cast?
          </h1>
        </div>

        {/* Cast Preview */}
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          {/* Author */}
          <div className="flex items-center gap-3 mb-4">
            <AvatarImage
              src={castData.author?.pfp_url}
              alt={castData.author?.username || castData.author?.display_name || "User"}
              size={40}
              className="w-10 h-10 rounded-full"
            />
            <div>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {castData.author?.display_name || castData.author?.username || `User ${castData.author?.fid}`}
              </div>
              {castData.author?.username && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  @{castData.author.username}
                </div>
              )}
            </div>
          </div>
          
          {/* Cast Text */}
          <div className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
            {castData.text || "No text content"}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        {isCurator ? (
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCurate}
              disabled={isPasting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPasting ? "Curating..." : "Curate"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                You need curator access to curate casts. Contact Chris to request curator access.
              </p>
              <a
                href={farcasterDmLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Message Chris
              </a>
            </div>
            <button
              onClick={handleCancel}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Go to Feed
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <MiniAppProvider>
      <ShareContent />
    </MiniAppProvider>
  );
}
