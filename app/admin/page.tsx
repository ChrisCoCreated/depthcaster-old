"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";
import { BuildIdeasManager } from "@/app/components/BuildIdeasManager";

export default function AdminPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const { isGranted, isSupported, isDenied, requestPermission } = useNotificationPermission();
  const [notificationStatus, setNotificationStatus] = useState<string>("");
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

  const handleRequestPermission = async () => {
    if (!isSupported) {
      setNotificationStatus("Notifications are not supported in this browser");
      return;
    }

    try {
      const granted = await requestPermission();
      if (granted) {
        setNotificationStatus("✓ Notification permission granted!");
        setTimeout(() => setNotificationStatus(""), 3000);
      } else {
        setNotificationStatus("✗ Notification permission denied. Please enable it in your browser settings.");
      }
    } catch (error: any) {
      console.error("Failed to request permission:", error);
      setNotificationStatus(`Error: ${error.message || "Failed to request permission"}`);
    }
  };

  const sendTestNotification = async () => {
    try {
      setNotificationStatus("Sending push notification...");

      const response = await fetch("/api/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
          body: JSON.stringify({
          userFid: user.fid,
          title: "Sopha Test Notification",
          body: "This is a test notification sent from the admin page. It should appear on your other devices!",
          icon: "/icon-192x192.webp",
          badge: "/icon-96x96.webp",
          data: { url: "/" },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to send notification");
      }

      setNotificationStatus(
        `✓ Push notification sent! Delivered to ${result.sent} device(s). Check your other devices!`
      );
      setTimeout(() => setNotificationStatus(""), 5000);
    } catch (error: any) {
      console.error("Failed to send push notification:", error);
      setNotificationStatus(`Error: ${error.message || "Failed to send notification"}`);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">
          Admin Panel
        </h1>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Notification Testing
          </h2>

          <div className="space-y-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>Test sending a device notification to user FID {user.fid}</p>
              <p className="mt-2">
                Notification Support: {isSupported ? "✓ Supported" : "✗ Not Supported"}
              </p>
              <p>
                Permission Status:{" "}
                {isGranted ? "✓ Granted" : isDenied ? "✗ Denied (check browser settings)" : "✗ Not Granted"}
              </p>
            </div>

            {!isGranted && !isDenied && (
              <button
                onClick={handleRequestPermission}
                disabled={!isSupported}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Request Notification Permission
              </button>
            )}

            <button
              onClick={sendTestNotification}
              className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors"
            >
              Send Test Push Notification (to other devices)
            </button>

            {notificationStatus && (
              <div
                className={`p-3 rounded-lg ${
                  notificationStatus.startsWith("✓")
                    ? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200"
                    : "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200"
                }`}
              >
                {notificationStatus}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Admin Tools
          </h2>
          <div className="space-y-4">
            <Link
              href="/admin/statistics"
              className="block px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-center"
            >
              Statistics Dashboard
            </Link>
            <Link
              href="/admin/roles"
              className="block px-4 py-3 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors text-center"
            >
              Manage User Roles
            </Link>
            <Link
              href="/admin/tags"
              className="block px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-center"
            >
              View Cast Tags
            </Link>
            <Link
              href="/admin/curators-leaderboard"
              className="block px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-center"
            >
              Curators Leaderboard
            </Link>
            <Link
              href="/admin/quality"
              className="block px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-center"
            >
              Quality Range Filter
            </Link>
            <Link
              href="/admin/notifications"
              className="block px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-center"
            >
              Send App Update Notifications
            </Link>
            <Link
              href="/updates"
              className="block px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-center"
            >
              Feature Updates
            </Link>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Experimental Features
          </h2>
          <div className="space-y-4">
            <Link
              href="/admin/art-feed"
              className="block px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-center"
            >
              Art Feed
            </Link>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              View images from any user's casts in a horizontal scrolling gallery
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          <BuildIdeasManager />
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            User Info
          </h2>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <p>FID: {user.fid}</p>
            <p>Username: {user.username || "N/A"}</p>
            <p>Display Name: {user.display_name || "N/A"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

