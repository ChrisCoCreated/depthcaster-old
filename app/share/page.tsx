"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function SharePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Get castHash from URL params (provided by share extension)
    const castHash = searchParams.get("castHash");
    
    if (castHash) {
      // Redirect to miniapp with the castHash as a query parameter
      router.replace(`/miniapp?castHash=${encodeURIComponent(castHash)}`);
    } else {
      // If no castHash, just redirect to miniapp
      router.replace("/miniapp");
    }
  }, [searchParams, router]);

  // Show loading state while redirecting
  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
      <div className="text-gray-600 dark:text-gray-400">Loading...</div>
    </div>
  );
}
