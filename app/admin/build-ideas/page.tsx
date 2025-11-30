"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import { BuildIdeasManager } from "@/app/components/BuildIdeasManager";

export default function BuildIdeasPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          Build Ideas Manager
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage build ideas and feedback from users
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
        <BuildIdeasManager />
      </div>
    </div>
  );
}
