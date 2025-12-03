"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AvatarImage } from "@/app/components/AvatarImage";

interface Recommender {
  recommender_fid: number;
  recommender_username: string | null;
  recommender_display_name: string | null;
  recommender_pfp_url: string | null;
  created_at: string;
}

interface Recommendation {
  userFid: number;
  username: string | null;
  displayName: string | null;
  pfpUrl: string | null;
  recommenders: Recommender[];
}

export default function CuratorRecommendationsPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [addingRole, setAddingRole] = useState<{ userFid: number } | null>(null);

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
          loadRecommendations();
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

  const loadRecommendations = async () => {
    if (!user?.fid) return;
    
    setIsLoadingRecommendations(true);
    try {
      const response = await fetch(`/api/admin/curator-recommendations?adminFid=${user.fid}`);
      const data = await response.json();
      
      if (response.ok) {
        setRecommendations(data.recommendations || []);
      } else {
        setMessage({ type: "error", text: data.error || "Failed to load recommendations" });
      }
    } catch (error: any) {
      console.error("Failed to load recommendations:", error);
      setMessage({ type: "error", text: error.message || "Failed to load recommendations" });
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  const handleAddCuratorRole = async (userFid: number) => {
    if (!user?.fid) return;

    setAddingRole({ userFid });
    setMessage(null);

    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminFid: user.fid,
          userFid: userFid,
          role: "curator",
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: `Curator role added to user ${userFid}` });
        // Reload recommendations to reflect changes
        loadRecommendations();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to add curator role" });
      }
    } catch (error: any) {
      console.error("Failed to add curator role:", error);
      setMessage({ type: "error", text: error.message || "Failed to add curator role" });
    } finally {
      setAddingRole(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Curator Recommendations
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage users recommended for curator role by existing curators
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200"
                : "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {isLoadingRecommendations ? (
          <div className="text-center py-12 text-gray-500">Loading recommendations...</div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No curator recommendations yet.
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Recommended By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {recommendations.map((rec) => (
                    <tr key={rec.userFid} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <AvatarImage
                            src={rec.pfpUrl}
                            alt={rec.displayName || rec.username || `User ${rec.userFid}`}
                            size={40}
                            className="w-10 h-10 rounded-full"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {rec.displayName || rec.username || `User ${rec.userFid}`}
                            </div>
                            {rec.username && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                @{rec.username}
                              </div>
                            )}
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              FID: {rec.userFid}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          {rec.recommenders.map((recommender) => (
                            <div key={recommender.recommender_fid} className="flex items-center gap-2">
                              <AvatarImage
                                src={recommender.recommender_pfp_url}
                                alt={recommender.recommender_display_name || recommender.recommender_username || `User ${recommender.recommender_fid}`}
                                size={32}
                                className="w-8 h-8 rounded-full"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-900 dark:text-gray-100">
                                  {recommender.recommender_display_name || recommender.recommender_username || `User ${recommender.recommender_fid}`}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatDate(recommender.created_at)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAddCuratorRole(rec.userFid)}
                            disabled={addingRole?.userFid === rec.userFid}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                          >
                            {addingRole?.userFid === rec.userFid ? "Adding..." : "Add Curator Role"}
                          </button>
                          <Link
                            href={`/profile/${rec.userFid}`}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
                          >
                            View Profile
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
