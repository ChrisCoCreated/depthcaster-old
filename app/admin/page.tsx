"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import Link from "next/link";
import { useNotificationPermission } from "@/lib/hooks/useNotificationPermission";
import { BuildIdeasManager } from "@/app/components/BuildIdeasManager";
import {
  ChevronDown,
  ChevronUp,
  BarChart3,
  Users,
  Tag,
  Award,
  Filter,
  Bell,
  Palette,
  TestTube,
  Settings,
} from "lucide-react";

export default function AdminPage() {
  const { user } = useNeynarContext();
  const { isGranted, isSupported, isDenied, requestPermission } = useNotificationPermission();
  const [notificationStatus, setNotificationStatus] = useState<string>("");
  const [showNotificationTesting, setShowNotificationTesting] = useState(false);

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
    if (!user) {
      setNotificationStatus("Error: User not found");
      return;
    }

    try {
      setNotificationStatus("Sending push notification...");

      const response = await fetch("/api/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
          body: JSON.stringify({
          userFid: user.fid,
          title: "Depthcaster Test Notification",
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
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Admin Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage your application settings, users, and content
        </p>
      </div>

      {/* Notification Testing - Collapsible */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg mb-6">
        <button
          onClick={() => setShowNotificationTesting(!showNotificationTesting)}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-lg"
        >
          <div className="flex items-center gap-3">
            <TestTube className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Notification Testing
            </h2>
          </div>
          {showNotificationTesting ? (
            <ChevronUp className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          )}
        </button>

        {showNotificationTesting && (
          <div className="px-6 pb-6 space-y-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>Test sending a device notification to user FID {user?.fid ?? "N/A"}</p>
              <p className="mt-2">
                Notification Support: {isSupported ? "✓ Supported" : "✗ Not Supported"}
              </p>
              <p>
                Permission Status:{" "}
                {isGranted ? "✓ Granted" : isDenied ? "✗ Denied (check browser settings)" : "✗ Not Granted"}
              </p>
            </div>

            <div className="flex gap-3">
              {!isGranted && !isDenied && (
                <button
                  onClick={handleRequestPermission}
                  disabled={!isSupported}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Request Permission
                </button>
              )}

              <button
                onClick={sendTestNotification}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Send Test Notification
              </button>
            </div>

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
        )}
      </div>

      {/* Analytics & Statistics */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Analytics & Statistics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/admin/statistics"
            className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <BarChart3 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                Statistics Dashboard
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              View comprehensive analytics, user metrics, and system performance data
            </p>
          </Link>
        </div>
      </div>

      {/* User Management */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          User Management
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/admin/roles"
            className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                User Roles
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Manage user roles and permissions (curator, admin, tester)
            </p>
          </Link>
        </div>
      </div>

      {/* Content Management */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Content Management
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/admin/tags"
            className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Tag className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                Cast Tags
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              View and manage tags assigned to casts
            </p>
          </Link>

          <Link
            href="/admin/curators-leaderboard"
            className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <Award className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                Curators Leaderboard
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              View top curators and their curation statistics
            </p>
          </Link>

          <Link
            href="/admin/quality"
            className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Filter className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                Quality Filter
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Filter casts and replies by quality score range
            </p>
          </Link>
        </div>
      </div>

      {/* System Tools */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          System Tools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/admin/notifications"
            className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                <Bell className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                Send Notifications
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Send app update notifications to users
            </p>
          </Link>
        </div>
      </div>

      {/* Experimental Features */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Experimental Features
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/admin/art-feed"
            className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-lg">
                <Palette className="w-5 h-5 text-pink-600 dark:text-pink-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                Art Feed
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              View images from any user's casts in a gallery
            </p>
          </Link>
        </div>
      </div>

      {/* Build Ideas Manager */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
        <BuildIdeasManager />
      </div>
    </div>
  );
}

