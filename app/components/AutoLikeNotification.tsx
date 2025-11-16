"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface AutoLikeNotificationProps {
  isOpen: boolean;
  onClose: () => void;
  onDisable: () => void;
}

export function AutoLikeNotification({ isOpen, onClose, onDisable }: AutoLikeNotificationProps) {
  const [isDisabling, setIsDisabling] = useState(false);

  if (!isOpen) return null;

  const handleDisable = async () => {
    setIsDisabling(true);
    try {
      onDisable();
      onClose();
    } catch (error) {
      console.error("Failed to disable auto-like:", error);
    } finally {
      setIsDisabling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="pr-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Auto-like on Curation
          </h3>
          
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            When you curate a cast, it will automatically be liked. This won't happen for casts curated with @deepbot.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleDisable}
              disabled={isDisabling}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Turn Off
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Keep On
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



