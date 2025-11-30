"use client";

import { useEffect, useState } from "react";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import Link from "next/link";

export default function UpdatesPage() {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      </main>
    </div>
  );
}
