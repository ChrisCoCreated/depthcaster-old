"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useUpdateCheck } from "@/lib/hooks/useUpdateCheck";

export function UpdateNotification() {
  const { updateAvailable, refresh } = useUpdateCheck();
  const [dismissed, setDismissed] = useState(false);

  if (!updateAvailable || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    // The update will still be available, but user dismissed the notification
    // They can refresh manually later or it will show again on next check
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="pr-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Update Available
          </h3>
          
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            A new version of Sopha is available. Refresh the page to get the latest features and improvements.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={refresh}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Refresh Now
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

