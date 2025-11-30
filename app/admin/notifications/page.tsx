"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminNotificationsPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [targetType, setTargetType] = useState<"all" | "targeted">("all");
  const [targetFids, setTargetFids] = useState("");
  const [targetRole, setTargetRole] = useState("");

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !user.fid) {
      setMessage({ type: "error", text: "You must be logged in to send notifications" });
      return;
    }
    
    if (!title.trim() || !body.trim()) {
      setMessage({ type: "error", text: "Title and message are required" });
      return;
    }

    if (targetType === "targeted" && !targetFids.trim() && !targetRole.trim()) {
      setMessage({ type: "error", text: "Please provide target FIDs or select a role" });
      return;
    }

    setIsSending(true);
    setMessage(null);

    try {
      const payload: any = {
        title: title.trim(),
        body: body.trim(),
        targetType,
        adminFid: user.fid,
      };

      if (url.trim()) {
        payload.url = url.trim();
      }

      if (targetType === "targeted") {
        if (targetFids.trim()) {
          const fids = targetFids
            .split(",")
            .map((fid) => parseInt(fid.trim()))
            .filter((fid) => !isNaN(fid));
          if (fids.length > 0) {
            payload.targetFids = fids;
          }
        }
        if (targetRole.trim()) {
          payload.targetRole = targetRole.trim();
        }
      }

      const response = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send notifications");
      }

      setMessage({
        type: "success",
        text: `Notifications sent successfully! Created ${data.notificationsCreated} notification(s), sent ${data.pushNotificationsSent} push notification(s) to ${data.totalUsers} user(s).`,
      });

      // Reset form
      setTitle("");
      setBody("");
      setUrl("");
      setTargetType("all");
      setTargetFids("");
      setTargetRole("");
    } catch (error: any) {
      console.error("Failed to send notifications:", error);
      setMessage({ type: "error", text: error.message || "Failed to send notifications" });
    } finally {
      setIsSending(false);
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
    <div className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Send App Update Notifications
          </h1>
          <Link
            href="/admin"
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to Admin
          </Link>
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

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., New Feature: Enhanced Feed"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Enter the notification message..."
                rows={6}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                URL (Optional)
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://depthcaster.app/updates/..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Link users will be taken to when they click the notification
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Target Audience <span className="text-red-500">*</span>
              </label>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="all"
                    checked={targetType === "all"}
                    onChange={(e) => setTargetType(e.target.value as "all" | "targeted")}
                    className="mr-2"
                  />
                  <span className="text-gray-900 dark:text-gray-100">All users</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="targeted"
                    checked={targetType === "targeted"}
                    onChange={(e) => setTargetType(e.target.value as "all" | "targeted")}
                    className="mr-2"
                  />
                  <span className="text-gray-900 dark:text-gray-100">Targeted users</span>
                </label>
              </div>

              {targetType === "targeted" && (
                <div className="mt-4 space-y-4 pl-6 border-l-2 border-gray-200 dark:border-gray-700">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      User FIDs (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={targetFids}
                      onChange={(e) => setTargetFids(e.target.value)}
                      placeholder="e.g., 123, 456, 789"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Or select by role
                    </label>
                    <select
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select a role...</option>
                      <option value="curator">Curators</option>
                      <option value="admin">Admins</option>
                      <option value="superadmin">Super Admins</option>
                      <option value="tester">Testers</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={isSending}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isSending ? "Sending..." : "Send Notifications"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitle("");
                  setBody("");
                  setUrl("");
                  setTargetType("all");
                  setTargetFids("");
                  setTargetRole("");
                  setMessage(null);
                }}
                className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
