"use client";

import { NotificationSettings } from "../components/NotificationSettings";
import { useNeynarContext } from "@neynar/react";

export default function SettingsPage() {
  const { user } = useNeynarContext();

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

  return (
    <div className="min-h-screen">
      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
          <NotificationSettings />
        </div>
      </main>
    </div>
  );
}

