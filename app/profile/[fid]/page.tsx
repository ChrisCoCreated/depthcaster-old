"use client";

import { useEffect, useState, use } from "react";
import { useNeynarContext } from "@neynar/react";
import { Feed } from "../../components/Feed";
import Link from "next/link";

export default function ProfilePage({
  params,
}: {
  params: Promise<{ fid: string }>;
}) {
  const { fid: fidParam } = use(params);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const fid = parseInt(fidParam);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Note: This would need a user lookup API endpoint
        // For now, we'll just show a basic profile
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch profile:", error);
        setLoading(false);
      }
    };

    fetchProfile();
  }, [fid]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            ← Back to feed
          </Link>
        </div>
        
        <div className="mb-8 p-6 border border-gray-200 dark:border-gray-800 rounded-lg">
          <h1 className="text-2xl font-bold mb-2">Profile FID: {fid}</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Profile details coming soon
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Casts</h2>
          <Feed viewerFid={fid} initialFeedType="curated" />
        </div>
      </main>
    </div>
  );
}

