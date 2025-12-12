"use client";

import { useNeynarContext } from "@neynar/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { GatingRule } from "@/lib/collection-gating";

interface Collection {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  creatorFid: number;
  accessType: "open" | "gated_user" | "gated_rule";
  gatedUserId: number | null;
  gatingRule: GatingRule | null;
  displayType: "text" | "image" | "image-text";
  autoCurationEnabled: boolean;
  autoCurationRules: any;
  displayMode: any;
  headerConfig: any;
  hiddenEmbedUrls: string[] | null;
  orderMode: "manual" | "auto";
  orderDirection: "asc" | "desc";
  createdAt: string;
  updatedAt: string;
}

export default function CollectionsPage() {
  const { user } = useNeynarContext();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);

  useEffect(() => {
    if (user?.fid) {
      fetchCollections();
    } else {
      setLoading(false);
    }
  }, [user?.fid]);

  const fetchCollections = async () => {
    if (!user?.fid) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/collections?userFid=${user.fid}`);
      
      if (!response.ok) {
        throw new Error("Failed to load collections");
      }
      
      const data = await response.json();
      setCollections(data.collections || []);
    } catch (err) {
      console.error("Error fetching collections:", err);
      setError(err instanceof Error ? err.message : "Failed to load collections");
    } finally {
      setLoading(false);
    }
  };

  const handleEditSuccess = () => {
    setEditingCollection(null);
    fetchCollections();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Please sign in to view your collections</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            My Collections
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            View and manage your collections
          </p>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Loading collections...
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No collections found. Collections you create or have access to will appear here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((collection) => (
              <div
                key={collection.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <Link
                    href={`/collection/${collection.name}`}
                    className="flex-1 min-w-0"
                  >
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {collection.displayName || collection.name}
                    </h3>
                  </Link>
                  {collection.creatorFid === user.fid && (
                    <button
                      onClick={() => setEditingCollection(collection)}
                      className="ml-2 p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      aria-label="Edit collection"
                      title="Edit collection"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                </div>
                {collection.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                    {collection.description}
                  </p>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                    {collection.accessType}
                  </span>
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
                    {collection.displayType}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {editingCollection && (
          <CollectionEditModal
            userFid={user.fid}
            collection={editingCollection}
            onClose={() => setEditingCollection(null)}
            onSuccess={handleEditSuccess}
            onError={(err) => {
              setError(err);
              setTimeout(() => setError(null), 5000);
            }}
          />
        )}
      </div>
    </div>
  );
}

function CollectionEditModal({
  userFid,
  collection,
  onClose,
  onSuccess,
  onError,
}: {
  userFid: number;
  collection: Collection;
  onClose: () => void;
  onSuccess: () => void;
  onError: (error: string) => void;
}) {
  const [formData, setFormData] = useState({
    displayName: collection.displayName || "",
    description: collection.description || "",
    accessType: collection.accessType,
    displayType: collection.displayType,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        adminFid: userFid,
        displayName: formData.displayName || null,
        description: formData.description || null,
        accessType: formData.accessType,
        displayType: formData.displayType,
      };

      const response = await fetch(`/api/collections/${encodeURIComponent(collection.name)}/manage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update collection");
      }

      onSuccess();
    } catch (error: any) {
      onError(error.message || "Failed to update collection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Edit Collection</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Collection Name
              </label>
              <input
                type="text"
                value={collection.name}
                disabled
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Collection name cannot be changed</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Optional display name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Optional description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Access Type
              </label>
              <select
                value={formData.accessType}
                onChange={(e) => setFormData({ ...formData, accessType: e.target.value as "open" | "gated_user" | "gated_rule" })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="open">Open</option>
                <option value="gated_user">Gated User</option>
                <option value="gated_rule">Gated Rule</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Type
              </label>
              <select
                value={formData.displayType}
                onChange={(e) => setFormData({ ...formData, displayType: e.target.value as "text" | "image" | "image-text" })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="text">Text</option>
                <option value="image">Image</option>
                <option value="image-text">Image + Text</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


