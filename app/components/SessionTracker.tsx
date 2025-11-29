"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useNeynarContext } from "@neynar/react";
import { startSession, endSession, trackSessionTime, shouldStartNewSession, analytics } from "@/lib/analytics";

let previousPath: string | null = null;

const DEBUG_USER_FID = 5701;

interface Toast {
  message: string;
  type: "info" | "success" | "error";
}

export function SessionTracker() {
  const pathname = usePathname();
  const { user } = useNeynarContext();
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    // Initialize session tracking
    const isNewSession = shouldStartNewSession();
    if (isNewSession) {
      startSession();
      
      // Trigger incremental reaction sync on new session (non-blocking)
      if (user?.fid) {
        // Show toast for debug user only
        if (user.fid === DEBUG_USER_FID) {
          setTimeout(() => {
            setToast({ message: "🔄 Starting incremental reaction sync...", type: "info" });
          }, 0);
        }
        
        fetch("/api/user/reactions/sync-incremental", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fid: user.fid }),
        })
        .then(async (response) => {
          if (user.fid === DEBUG_USER_FID) {
            if (response.ok) {
              const data = await response.json();
              setToast({ 
                message: `✅ Reaction sync started: ${data.message || "Processing reactions..."}`, 
                type: "success" 
              });
              // Auto-dismiss after 5 seconds
              setTimeout(() => setToast(null), 5000);
            } else {
              setToast({ 
                message: `❌ Reaction sync failed: ${response.statusText}`, 
                type: "error" 
              });
              setTimeout(() => setToast(null), 5000);
            }
          }
        })
        .catch((error) => {
          // Silently fail - reaction sync shouldn't break the app
          console.error("Failed to trigger incremental reaction sync:", error);
          if (user.fid === DEBUG_USER_FID) {
            setToast({ 
              message: `❌ Reaction sync error: ${error.message}`, 
              type: "error" 
            });
            setTimeout(() => setToast(null), 5000);
          }
        });
      }
    }

    // Track page view
    analytics.trackPageView(pathname, previousPath || undefined);
    
    // Also track to database
    const trackPageView = async () => {
      try {
        await fetch("/api/analytics/page-view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            pagePath: pathname,
            userFid: user?.fid || null,
          }),
        });
      } catch (error) {
        // Silently fail - analytics shouldn't break the app
        console.error("Failed to track page view:", error);
      }
    };
    trackPageView();
    
    previousPath = pathname;

    // Track session time periodically (every 30 seconds)
    const sessionInterval = setInterval(() => {
      trackSessionTime();
    }, 30000);

    // Track session time on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (shouldStartNewSession()) {
          endSession();
          startSession();
          
          // Trigger incremental reaction sync on new session (non-blocking)
          if (user?.fid) {
            // Show toast for debug user only
            if (user.fid === DEBUG_USER_FID) {
              setTimeout(() => {
                setToast({ message: "🔄 Starting incremental reaction sync...", type: "info" });
              }, 0);
            }
            
            fetch("/api/user/reactions/sync-incremental", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fid: user.fid }),
            })
            .then(async (response) => {
              if (user.fid === DEBUG_USER_FID) {
                if (response.ok) {
                  const data = await response.json();
                  setToast({ 
                    message: `✅ Reaction sync started: ${data.message || "Processing reactions..."}`, 
                    type: "success" 
                  });
                  setTimeout(() => setToast(null), 5000);
                } else {
                  setToast({ 
                    message: `❌ Reaction sync failed: ${response.statusText}`, 
                    type: "error" 
                  });
                  setTimeout(() => setToast(null), 5000);
                }
              }
            })
            .catch((error) => {
              console.error("Failed to trigger incremental reaction sync:", error);
              if (user.fid === DEBUG_USER_FID) {
                setToast({ 
                  message: `❌ Reaction sync error: ${error.message}`, 
                  type: "error" 
                });
                setTimeout(() => setToast(null), 5000);
              }
            });
          }
        } else {
          trackSessionTime();
        }
      }
    };

    // Track session end on page unload
    const handleBeforeUnload = () => {
      endSession();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(sessionInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [pathname, user?.fid]);

  return (
    <>
      {/* Toast Notification - Only for debug user */}
      {toast && user?.fid === DEBUG_USER_FID && (
        <div
          className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[300] px-4 py-3 rounded-lg shadow-lg transition-all duration-300 ${
            toast.type === "success"
              ? "bg-green-500 text-white"
              : toast.type === "error"
              ? "bg-red-500 text-white"
              : "bg-blue-500 text-white"
          }`}
          role="alert"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{toast.message}</p>
            <button
              onClick={() => setToast(null)}
              className="ml-4 text-white hover:text-gray-200"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}




