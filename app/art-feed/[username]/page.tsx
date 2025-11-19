"use client";

import { useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter, useParams } from "next/navigation";

export default function ArtFeedPublicPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const params = useParams();
  const username = params?.username as string;

  useEffect(() => {
    if (!user?.fid) {
      router.push("/admin/art-feed");
      return;
    }

    // Check admin status
    const checkAndRedirect = async () => {
      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        const data = await response.json();
        
        if (data.isAdmin && username) {
          const cleanUsername = username.replace(/^@/, "");
          router.push(`/admin/art-feed?username=${encodeURIComponent(cleanUsername)}`);
        } else {
          router.push("/admin/art-feed");
        }
      } catch (error) {
        console.error("Failed to check admin access:", error);
        router.push("/admin/art-feed");
      }
    };

    checkAndRedirect();
  }, [user, router, username]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-500">Loading...</div>
    </div>
  );
}

