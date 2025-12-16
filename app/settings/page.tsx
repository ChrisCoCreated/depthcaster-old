"use client";

import { useState, useEffect } from "react";
import { NotificationSettings } from "../components/NotificationSettings";
import { FeedSettings } from "../components/FeedSettings";
import { BotSettings } from "../components/BotSettings";
import { WatchSettings } from "../components/WatchSettings";
import { CurationSettings } from "../components/CurationSettings";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { hasPlusRole } from "@/lib/roles-client";
import { hasNeynarUpdatesAccess } from "@/lib/plus-features";

const ADMIN_FID = 5701;

export default function SettingsPage() {
  const { user, logoutUser } = useNeynarContext();
  const router = useRouter();
  const [hasUpdatesAccess, setHasUpdatesAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  useEffect(() => {
    const checkUpdatesAccess = async () => {
      if (!user?.fid) {
        setHasUpdatesAccess(false);
        setIsCheckingAccess(false);
        return;
      }

      try {
        // Check for plus role only via API
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          const roles = data.roles || [];
          const userHasPlus = hasPlusRole(roles);
          
          // User has access only if they have plus role
          setHasUpdatesAccess(hasNeynarUpdatesAccess(userHasPlus));
        } else {
          setHasUpdatesAccess(false);
        }
      } catch (error) {
        console.error("Error checking updates access:", error);
        setHasUpdatesAccess(false);
      } finally {
        setIsCheckingAccess(false);
      }
    };

    checkUpdatesAccess();
  }, [user?.fid]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Please sign in to access settings
          </p>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logoutUser();
    router.push("/");
  };

  return (
    <div className="min-h-screen">
      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">
          Settings
        </h1>
        
        <div className="space-y-6">
          {user.fid === ADMIN_FID && (
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Admin
              </h2>
              <Link
                href="/admin"
                className="inline-block px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors"
              >
                Admin Panel
              </Link>
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <NotificationSettings />
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <FeedSettings />
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <BotSettings />
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <WatchSettings />
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <CurationSettings />
          </div>

          {!isCheckingAccess && hasUpdatesAccess && (
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Feature Updates
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Stay up to date with the latest features and improvements
              </p>
              <Link
                href="/updates"
                className="inline-block px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors"
              >
                View Updates
              </Link>
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Account
            </h2>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Log Out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

