"use client";

import { useEffect, useState } from "react";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import Link from "next/link";
import { useNeynarContext } from "@neynar/react";
import { hasPlusRoleUser, hasCuratorOrAdminRoleUser } from "@/lib/roles";
import { hasNeynarUpdatesAccess } from "@/lib/plus-features";

export default function UpdatesPage() {
  const { user } = useNeynarContext();
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const response = await fetch("/api/features");
        if (!response.ok) {
          throw new Error("Failed to load updates");
        }
        const data = await response.json();
        setContent(data.content);
      } catch (err: any) {
        console.error("Error fetching features update:", err);
        setError(err.message || "Failed to load updates");
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, []);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user?.fid) {
        setIsCheckingAdmin(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        const data = await response.json();
        setIsAdmin(data.isAdmin || false);
      } catch (error) {
        console.error("Failed to check admin access:", error);
        setIsAdmin(false);
      } finally {
        setIsCheckingAdmin(false);
      }
    };

    checkAdminAccess();
  }, [user]);

  useEffect(() => {
    const checkUpdatesAccess = async () => {
      if (!user?.fid) {
        setHasAccess(false);
        setIsCheckingAccess(false);
        return;
      }

      try {
        // Check for plus role or curator role (for backward compatibility)
        const [hasPlus, hasCurator] = await Promise.all([
          hasPlusRoleUser(user),
          hasCuratorOrAdminRoleUser(user),
        ]);
        
        // User has access if they have plus role OR curator role
        setHasAccess(hasNeynarUpdatesAccess(hasPlus) || hasCurator);
      } catch (error) {
        console.error("Error checking updates access:", error);
        setHasAccess(false);
      } finally {
        setIsCheckingAccess(false);
      }
    };

    checkUpdatesAccess();
  }, [user?.fid]);

  const parseMarkdownForNotification = (markdown: string): { title: string; body: string } => {
    // Extract the first update (before the first separator)
    const firstUpdate = markdown.split("\n\n---\n\n")[0];
    const lines = firstUpdate.split("\n");
    let title = "Feature Update";
    let body = "";

    // Find first H1 header, or fall back to H2 if no H1 found
    let foundHeader = false;
    for (const line of lines) {
      if (line.trim().startsWith("# ")) {
        // Remove # and emojis, get clean title
        title = line.trim().substring(2).trim();
        // Remove emojis (optional, but cleaner)
        title = title.replace(/[\u{1F300}-\u{1F9FF}]/gu, "").trim();
        foundHeader = true;
        break;
      } else if (!foundHeader && line.trim().startsWith("## ")) {
        // Fall back to H2 if no H1 found (e.g., date header)
        title = line.trim().substring(3).trim();
        foundHeader = true;
        // Continue to look for H1 after H2
      }
    }

    // Extract first paragraph after H1 (or after H2 if no H1)
    let foundTargetHeader = false;
    const bodyLines: string[] = [];
    
    for (const line of lines) {
      if (line.trim().startsWith("# ")) {
        foundTargetHeader = true;
        continue;
      }
      
      // If we found H2 but no H1, use H2 as starting point
      if (!foundTargetHeader && line.trim().startsWith("## ")) {
        foundTargetHeader = true;
        continue;
      }
      
      if (foundTargetHeader) {
        // Stop at next header
        if (line.trim().startsWith("##") || line.trim().startsWith("###")) {
          break;
        }
        // Stop at horizontal rule
        if (line.trim() === "---" || line.trim() === "***") {
          break;
        }
        // Collect non-empty lines
        if (line.trim()) {
          bodyLines.push(line.trim());
        } else if (bodyLines.length > 0) {
          // Empty line after content - we have our paragraph
          break;
        }
      }
    }

    // Join body lines, limit to 200 characters
    body = bodyLines.join(" ").substring(0, 200);
    if (bodyLines.join(" ").length > 200) {
      body += "...";
    }

    return { title: title || "Feature Update", body: body || "New features and improvements are available." };
  };

  const handleSendNotification = async () => {
    if (!user?.fid || !isAdmin) {
      setSendMessage({ type: "error", text: "You must be an admin to send notifications" });
      return;
    }

    if (!content) {
      setSendMessage({ type: "error", text: "No content available to send" });
      return;
    }

    setIsSending(true);
    setSendMessage(null);

    try {
      const { title, body } = parseMarkdownForNotification(content);

      const payload = {
        title,
        body,
        url: "/updates",
        targetType: "all",
        adminFid: user.fid,
      };

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

      setSendMessage({
        type: "success",
        text: `Notification sent successfully! Delivered to ${data.totalUsers} user(s).`,
      });
    } catch (error: any) {
      console.error("Failed to send notification:", error);
      setSendMessage({ type: "error", text: error.message || "Failed to send notification" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Feature Updates
          </h1>
          <Link
            href="/settings"
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to Settings
          </Link>
        </div>

        {isAdmin && !isCheckingAdmin && content && (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Admin Actions
            </h2>
            <div className="space-y-4">
              <button
                onClick={handleSendNotification}
                disabled={isSending || loading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isSending ? "Sending..." : "Send Update as Notification"}
              </button>
              {sendMessage && (
                <div
                  className={`p-3 rounded-lg ${
                    sendMessage.type === "success"
                      ? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200"
                      : "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200"
                  }`}
                >
                  {sendMessage.text}
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This will send a notification to all users with a link to this updates page.
              </p>
            </div>
          </div>
        )}

        {isCheckingAccess ? (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-8">
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              Checking access...
            </div>
          </div>
        ) : !hasAccess ? (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-8">
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              You don't have access to feature updates. This feature is available to Plus users.
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-8">
            {loading ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                Loading updates...
              </div>
            ) : error ? (
              <div className="text-center text-red-600 dark:text-red-400 py-8">
                {error}
              </div>
            ) : (
              <MarkdownRenderer content={content} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

