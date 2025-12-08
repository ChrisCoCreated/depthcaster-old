"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { isFeatureEnabledClient, FEATURE_FLAGS } from "@/lib/feature-flags";
import { X } from "lucide-react";

interface Collection {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  accessType: string;
}

interface CollectionSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (collectionName: string | null) => void; // null = main feed, string = collection name
  castHash: string;
  castData: any;
}

export function CollectionSelectModal({
  isOpen,
  onClose,
  onSelect,
  castHash,
  castData,
}: CollectionSelectModalProps) {
  const { user } = useNeynarContext();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if feature is enabled
  const isFeatureEnabled = isFeatureEnabledClient(FEATURE_FLAGS.COLLECTIONS_ENABLED);

  // Fetch accessible collections
  useEffect(() => {
    if (!isOpen || !isFeatureEnabled || !user?.fid) {
      setCollections([]);
      return;
    }

    const fetchCollections = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/collections?userFid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          setCollections(data.collections || []);
        }
      } catch (error) {
        console.error("Failed to fetch collections:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCollections();
  }, [isOpen, isFeatureEnabled, user?.fid]);

  // Handle selection
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      onSelect(selectedCollection);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // If feature is disabled, just show simple confirm (default behavior)
  if (!isFeatureEnabled) {
    return null; // Modal shouldn't show if feature disabled
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Curate Cast
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4">
          <div className="space-y-4">
            {/* Default option: Main feed */}
            <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <input
                type="radio"
                name="destination"
                value="main"
                checked={selectedCollection === null}
                onChange={() => setSelectedCollection(null)}
                className="w-4 h-4 text-purple-600"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  Curate to main feed
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Add to the curated feed visible to everyone
                </div>
              </div>
            </label>

            {/* Collection options */}
            {loading ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                Loading collections...
              </div>
            ) : collections.length > 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Or add to a collection:
                </div>
                {collections.map((collection) => (
                  <label
                    key={collection.id}
                    className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <input
                      type="radio"
                      name="destination"
                      value={collection.name}
                      checked={selectedCollection === collection.name}
                      onChange={() => setSelectedCollection(collection.name)}
                      className="w-4 h-4 text-purple-600"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {collection.displayName || collection.name}
                      </div>
                      {collection.description && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {collection.description}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                No collections available
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Curating..." : "Curate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

