"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import { CastCard } from "@/app/components/CastCard";

export default function CastQuotesPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [castHash, setCastHash] = useState<string>("");
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user?.fid) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        const data = await response.json();
        
        if (data.isAdmin) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          router.push("/");
        }
      } catch (error) {
        console.error("Failed to check admin access:", error);
        setIsAdmin(false);
        router.push("/");
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminAccess();
  }, [user, router]);

  const fetchQuotes = async () => {
    if (!castHash.trim()) {
      setError("Please enter a cast hash");
      return;
    }

    if (!user?.fid) {
      setError("User not found");
      return;
    }

    setLoadingQuotes(true);
    setError(null);
    setQuotes([]);

    try {
      const response = await fetch(
        `/api/admin/cast-quotes?adminFid=${user.fid}&castHash=${encodeURIComponent(castHash.trim())}&limit=100`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch quotes");
      }

      const data = await response.json();
      setQuotes(data.quotes || []);
      
      if (data.quotes && data.quotes.length === 0) {
        setError("No quotes found for this cast");
      }
    } catch (error: any) {
      console.error("Failed to fetch quotes:", error);
      setError(error.message || "Failed to fetch quotes");
      setQuotes([]);
    } finally {
      setLoadingQuotes(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchQuotes();
  };

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Access Denied</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Cast Quotes
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Find all casts that quote a specific cast by entering its hash
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Search for Quotes
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="castHash"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Cast Hash
            </label>
            <input
              id="castHash"
              type="text"
              value={castHash}
              onChange={(e) => setCastHash(e.target.value)}
              placeholder="0x12c9fa6b740e5243529fb7c8defd8a13938794c5"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Enter a cast hash (with or without 0x prefix)
            </p>
          </div>
          <button
            type="submit"
            disabled={loadingQuotes || !castHash.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingQuotes ? "Loading..." : "Fetch Quotes"}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200">
            {error}
          </div>
        )}
      </div>

      {quotes.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Quotes ({quotes.length})
          </h2>
          <div className="space-y-4">
            {quotes.map((cast) => (
              <CastCard
                key={cast.hash}
                cast={cast}
                feedType="curated"
              />
            ))}
          </div>
        </div>
      )}

      {loadingQuotes && quotes.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            Loading quotes...
          </div>
        </div>
      )}
    </div>
  );
}

