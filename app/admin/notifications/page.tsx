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
  const [isSendingDailyTest, setIsSendingDailyTest] = useState(false);
  const [isSendingWeeklyTest, setIsSendingWeeklyTest] = useState(false);
  const [isSendingMiniappTest, setIsSendingMiniappTest] = useState(false);
  const [dailyTestResult, setDailyTestResult] = useState<string | null>(null);
  const [weeklyTestResult, setWeeklyTestResult] = useState<string | null>(null);
  const [miniappTestResult, setMiniappTestResult] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [targetType, setTargetType] = useState<"all" | "targeted">("all");
  const [targetFids, setTargetFids] = useState("");
  const [targetRoles, setTargetRoles] = useState<string[]>([]);

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

    if (targetType === "targeted" && !targetFids.trim() && targetRoles.length === 0) {
      setMessage({ type: "error", text: "Please provide target FIDs or select at least one role" });
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
        if (targetRoles.length > 0) {
          payload.targetRoles = targetRoles;
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
      setTargetRoles([]);
    } catch (error: any) {
      console.error("Failed to send notifications:", error);
      setMessage({ type: "error", text: error.message || "Failed to send notifications" });
    } finally {
      setIsSending(false);
    }
  };

  const sendDailyStatsTest = async () => {
    if (!user?.fid) return;

    setIsSendingDailyTest(true);
    setDailyTestResult(null);

    try {
      const response = await fetch("/api/admin/statistics/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fid: user.fid }),
      });

      const data = await response.json();

      if (response.ok) {
        setDailyTestResult(
          `Test notification sent! ${data.pushNotificationsSent} push notifications sent to ${data.usersNotified} admin(s).`
        );
      } else {
        setDailyTestResult(`Error: ${data.error || "Failed to send test notification"}`);
      }
    } catch (error: any) {
      setDailyTestResult(`Error: ${error.message || "Failed to send test notification"}`);
    } finally {
      setIsSendingDailyTest(false);
    }
  };

  const sendWeeklyContributorsTest = async () => {
    if (!user?.fid) return;

    setIsSendingWeeklyTest(true);
    setWeeklyTestResult(null);

    try {
      const response = await fetch("/api/curators/weekly-contributors/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fid: user.fid }),
      });

      const data = await response.json();

      if (response.ok) {
        setWeeklyTestResult(
          `Test notification sent! ${data.pushNotificationsSent} push notifications sent to ${data.usersNotified} admin(s).`
        );
      } else {
        setWeeklyTestResult(`Error: ${data.error || "Failed to send test notification"}`);
      }
    } catch (error: any) {
      setWeeklyTestResult(`Error: ${error.message || "Failed to send test notification"}`);
    } finally {
      setIsSendingWeeklyTest(false);
    }
  };

  const sendMiniappTest = async () => {
    setIsSendingMiniappTest(true);
    setMiniappTestResult(null);

    try {
      console.log("[Admin] Sending miniapp test notification...");
      const response = await fetch("/api/admin/miniapp-notification/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("[Admin] Response status:", response.status, response.statusText);

      // Try to parse JSON, but handle non-JSON responses
      let data: any;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch (parseError) {
          console.error("[Admin] Failed to parse JSON response:", parseError);
          const text = await response.text();
          setMiniappTestResult(`Error: Failed to parse response as JSON\nStatus: ${response.status}\nResponse: ${text}`);
          return;
        }
      } else {
        const text = await response.text();
        console.error("[Admin] Non-JSON response received:", text);
        setMiniappTestResult(`Error: Unexpected response format\nStatus: ${response.status}\nResponse: ${text}`);
        return;
      }

      if (response.ok) {
        console.log("[Admin] Test notification sent successfully:", data);
        let resultMsg = data.message || `Test notification sent! ${data.sent} notification(s) delivered.`;
        if (data.payload) {
          resultMsg += `\n\nPayload sent:\n${JSON.stringify(data.payload, null, 2)}`;
        }
        setMiniappTestResult(resultMsg);
      } else {
        console.error("[Admin] Test notification failed:", data);
        let errorMsg = `Error: ${data.error || "Failed to send test notification"}`;
        if (data.errorDetails) {
          errorMsg += `\nStatus: ${data.errorDetails.status || response.status}`;
          if (data.errorDetails.statusText) {
            errorMsg += ` (${data.errorDetails.statusText})`;
          }
          if (data.errorDetails.data) {
            errorMsg += `\nDetails: ${JSON.stringify(data.errorDetails.data, null, 2)}`;
          }
        } else {
          errorMsg += `\nStatus: ${response.status} ${response.statusText}`;
        }
        setMiniappTestResult(errorMsg);
      }
    } catch (error: any) {
      console.error("[Admin] Network or other error sending test notification:", error);
      let errorMsg = `Error: ${error.message || "Failed to send test notification"}`;
      
      // Handle network errors
      if (error.name === "TypeError" && error.message.includes("fetch")) {
        errorMsg = `Network error: ${error.message}\nPlease check your connection and try again.`;
      }
      
      // Handle other error types
      if (error.response) {
        errorMsg += `\nResponse: ${JSON.stringify(error.response, null, 2)}`;
      }
      
      setMiniappTestResult(errorMsg);
    } finally {
      setIsSendingMiniappTest(false);
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

        {/* Test Automated Notifications Section */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Test Automated Notifications
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Send test notifications for automated notification systems. These will be sent to all admins and superadmins.
          </p>
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    Daily Stats Notification
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Test the daily statistics notification sent to curators at 6 AM UTC
                  </p>
                </div>
                <button
                  onClick={sendDailyStatsTest}
                  disabled={isSendingDailyTest}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSendingDailyTest ? "Sending..." : "Send Test"}
                </button>
              </div>
              {dailyTestResult && (
                <p className={`mt-2 text-sm ${dailyTestResult.startsWith("Error") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  {dailyTestResult}
                </p>
              )}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    Weekly Contributors Notification
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Test the weekly contributors notification sent to curators on Mondays at 12 PM UTC
                  </p>
                </div>
                <button
                  onClick={sendWeeklyContributorsTest}
                  disabled={isSendingWeeklyTest}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSendingWeeklyTest ? "Sending..." : "Send Test"}
                </button>
              </div>
              {weeklyTestResult && (
                <p className={`mt-2 text-sm ${weeklyTestResult.startsWith("Error") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  {weeklyTestResult}
                </p>
              )}
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                    Miniapp Notification
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Test the miniapp notification sent to all users when a new cast is curated
                  </p>
                </div>
                <button
                  onClick={sendMiniappTest}
                  disabled={isSendingMiniappTest}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSendingMiniappTest ? "Sending..." : "Send Test"}
                </button>
              </div>
              {miniappTestResult && (
                <div className={`mt-2 text-sm ${miniappTestResult.startsWith("Error") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  <pre className="whitespace-pre-wrap font-mono text-xs bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
                    {miniappTestResult}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>

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
                placeholder="https://sopha.social/updates/..."
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
                  <span className="text-gray-900 dark:text-gray-100">All users (who have signed in)</span>
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
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Only users who have signed in will receive notifications
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Or select by role(s)
                    </label>
                    <div className="space-y-2">
                      {["curator", "admin", "superadmin", "tester"].map((role) => (
                        <label key={role} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={targetRoles.includes(role)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTargetRoles([...targetRoles, role]);
                              } else {
                                setTargetRoles(targetRoles.filter((r) => r !== role));
                              }
                            }}
                            className="mr-2"
                          />
                          <span className="text-gray-900 dark:text-gray-100 capitalize">
                            {role === "superadmin" ? "Super Admins" : role === "admin" ? "Admins" : `${role}s`}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      You can select multiple roles. Only users who have signed in will receive notifications.
                    </p>
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
                  setTargetRoles([]);
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
