"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import { CastCard } from "@/app/components/CastCard";
import { X, Plus } from "lucide-react";

export default function CastQuotesPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [castHash, setCastHash] = useState<string>("");
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [collections, setCollections] = useState<any[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState<string>("");
  const [newCollectionDisplayName, setNewCollectionDisplayName] = useState<string>("");
  const [newCollectionDescription, setNewCollectionDescription] = useState<string>("");
  const [isAddingToCollection, setIsAddingToCollection] = useState(false);
  const [addResult, setAddResult] = useState<{ success: boolean; message: string } | null>(null);

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

  const fetchQuotes = async () => {
    if (!castHash.trim()) {
      setError("Please enter a cast hash");
      return;
    }

    if (!user?.fid) {
      setError("User not found");
      return;
    }

    setLoadingQuotes(true);
    setError(null);
    setQuotes([]);

    try {
      const url = `/api/admin/cast-quotes?adminFid=${user.fid}&castHash=${encodeURIComponent(castHash.trim())}&limit=100`;
      console.log("[Cast Quotes Page] Fetching quotes from:", url);
      
      const response = await fetch(url);
      console.log("[Cast Quotes Page] Response status:", response.status, response.statusText);

      if (!response.ok) {
        const data = await response.json();
        console.error("[Cast Quotes Page] Error response:", data);
        throw new Error(data.error || "Failed to fetch quotes");
      }

      const data = await response.json();
      console.log("[Cast Quotes Page] Response data:", {
        hasQuotes: !!data.quotes,
        quotesLength: data.quotes?.length,
        count: data.count,
        dataKeys: Object.keys(data),
      });
      
      setQuotes(data.quotes || []);
      
      if (data.quotes && data.quotes.length === 0) {
        console.log("[Cast Quotes Page] No quotes found - setting error message");
        setError("No quotes found for this cast");
      } else if (!data.quotes) {
        console.warn("[Cast Quotes Page] No quotes property in response:", data);
        setError("Unexpected response format from server");
      }
    } catch (error: any) {
      console.error("[Cast Quotes Page] Failed to fetch quotes:", error);
      setError(error.message || "Failed to fetch quotes");
      setQuotes([]);
    } finally {
      setLoadingQuotes(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchQuotes();
  };

  const fetchCollections = async () => {
    if (!user?.fid) return;
    
    setLoadingCollections(true);
    try {
      const response = await fetch(`/api/collections?userFid=${user.fid}`);
      if (response.ok) {
        const data = await response.json();
        setCollections(data.collections || []);
      }
    } catch (error) {
      console.error("Failed to fetch collections:", error);
    } finally {
      setLoadingCollections(false);
    }
  };

  const handleOpenCollectionModal = () => {
    setShowCollectionModal(true);
    setSelectedCollection(null);
    setNewCollectionName("");
    setNewCollectionDisplayName("");
    setNewCollectionDescription("");
    setAddResult(null);
    fetchCollections();
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim() || !user?.fid) return;

    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminFid: user.fid,
          name: newCollectionName.trim(),
          displayName: newCollectionDisplayName.trim() || null,
          description: newCollectionDescription.trim() || null,
          accessType: "open",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create collection");
      }

      const data = await response.json();
      setSelectedCollection(data.collection.name);
      setNewCollectionName("");
      setNewCollectionDisplayName("");
      setNewCollectionDescription("");
      await fetchCollections();
    } catch (error: any) {
      setAddResult({ success: false, message: error.message || "Failed to create collection" });
    }
  };

  const handleAddToCollection = async () => {
    if (!selectedCollection || !user?.fid || quotes.length === 0) return;

    setIsAddingToCollection(true);
    setAddResult(null);

    try {
      // Prepare cast data array
      const castHashes = quotes.map((cast) => cast.hash);
      const castDataArray = quotes.map((cast) => cast);

      const response = await fetch("/api/admin/cast-quotes/batch-add-to-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminFid: user.fid,
          collectionName: selectedCollection,
          castHashes,
          castDataArray,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add casts to collection");
      }

      const data = await response.json();
      setAddResult({
        success: true,
        message: data.message || `Successfully added ${data.added} cast(s) to collection`,
      });
      
      // Close modal after a short delay on success
      setTimeout(() => {
        setShowCollectionModal(false);
        setAddResult(null);
      }, 2000);
    } catch (error: any) {
      setAddResult({
        success: false,
        message: error.message || "Failed to add casts to collection",
      });
    } finally {
      setIsAddingToCollection(false);
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
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Cast Quotes
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Find all casts that quote a specific cast by entering its hash
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Search for Quotes
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="castHash"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Cast Hash
            </label>
            <input
              id="castHash"
              type="text"
              value={castHash}
              onChange={(e) => setCastHash(e.target.value)}
              placeholder="0x12c9fa6b740e5243529fb7c8defd8a13938794c5"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Enter a cast hash (with or without 0x prefix)
            </p>
          </div>
          <button
            type="submit"
            disabled={loadingQuotes || !castHash.trim()}
            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingQuotes ? "Loading..." : "Fetch Quotes"}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200">
            {error}
          </div>
        )}
      </div>

      {quotes.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Quotes ({quotes.length})
            </h2>
            <button
              onClick={handleOpenCollectionModal}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add All to Collection
            </button>
          </div>
          <div className="space-y-4">
            {quotes.map((cast) => (
              <CastCard
                key={cast.hash}
                cast={cast}
                feedType="curated"
              />
            ))}
          </div>
        </div>
      )}

      {loadingQuotes && quotes.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            Loading quotes...
          </div>
        </div>
      )}

      {/* Collection Selection Modal */}
      {showCollectionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => !isAddingToCollection && setShowCollectionModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Add All Quotes to Collection
              </h2>
              <button
                onClick={() => setShowCollectionModal(false)}
                disabled={isAddingToCollection}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Create New Collection Section */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Create New Collection</h3>
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Collection name (required)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                />
                <input
                  type="text"
                  value={newCollectionDisplayName}
                  onChange={(e) => setNewCollectionDisplayName(e.target.value)}
                  placeholder="Display name (optional)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                />
                <textarea
                  value={newCollectionDescription}
                  onChange={(e) => setNewCollectionDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                />
                <button
                  onClick={handleCreateCollection}
                  disabled={!newCollectionName.trim() || isAddingToCollection}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Create Collection
                </button>
              </div>

              {/* Select Existing Collection */}
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Or Select Existing Collection</h3>
                {loadingCollections ? (
                  <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                    Loading collections...
                  </div>
                ) : collections.length > 0 ? (
                  <div className="space-y-2">
                    {collections.map((collection) => (
                      <label
                        key={collection.id}
                        className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <input
                          type="radio"
                          name="collection"
                          value={collection.name}
                          checked={selectedCollection === collection.name}
                          onChange={() => setSelectedCollection(collection.name)}
                          disabled={isAddingToCollection}
                          className="w-4 h-4 text-purple-600"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                            {collection.displayName || collection.name}
                          </div>
                          {collection.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
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

              {/* Result Message */}
              {addResult && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    addResult.success
                      ? "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200"
                      : "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200"
                  }`}
                >
                  {addResult.message}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 p-4 border-t border-gray-200 dark:border-gray-800 sticky bottom-0 bg-white dark:bg-gray-900">
              <button
                type="button"
                onClick={() => setShowCollectionModal(false)}
                disabled={isAddingToCollection}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToCollection}
                disabled={!selectedCollection || isAddingToCollection}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAddingToCollection ? "Adding..." : `Add ${quotes.length} Cast(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

