"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import { CastCard } from "@/app/components/CastCard";

interface TagCount {
  tag: string;
  count: number;
}

export default function TagsPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [casts, setCasts] = useState<any[]>([]);
  const [loadingCasts, setLoadingCasts] = useState(false);

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
          fetchTags();
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

  const fetchTags = async () => {
    try {
      const response = await fetch("/api/tags");
      if (response.ok) {
        const data = await response.json();
        setTags(data.tags || []);
      }
    } catch (error) {
      console.error("Failed to fetch tags:", error);
    }
  };

  const fetchCastsByTag = async (tag: string) => {
    setLoadingCasts(true);
    try {
      const viewerFidParam = user?.fid ? `&viewerFid=${user.fid}` : "";
      const response = await fetch(`/api/tags?tag=${encodeURIComponent(tag)}${viewerFidParam}`);
      if (response.ok) {
        const data = await response.json();
        setCasts(data.casts || []);
      }
    } catch (error) {
      console.error("Failed to fetch casts by tag:", error);
      setCasts([]);
    } finally {
      setLoadingCasts(false);
    }
  };

  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
      setCasts([]);
    } else {
      setSelectedTag(tag);
      fetchCastsByTag(tag);
    }
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
          Cast Tags
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          View and manage tags assigned to casts
        </p>
      </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            All Tags
          </h2>
          {tags.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No tags yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tagCount) => (
                <button
                  key={tagCount.tag}
                  onClick={() => handleTagClick(tagCount.tag)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    selectedTag === tagCount.tag
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {tagCount.tag} ({tagCount.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedTag && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Casts tagged with "{selectedTag}"
            </h2>
            {loadingCasts ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                Loading casts...
              </div>
            ) : casts.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                No casts found with this tag.
              </div>
            ) : (
              <div className="space-y-4">
                {casts.map((cast) => (
                  <CastCard
                    key={cast.hash}
                    cast={cast}
                    feedType="curated"
                  />
                ))}
              </div>
            )}
          </div>
        )}
    </div>
  );
}

