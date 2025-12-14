"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { X, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { hasCollectionsOrAdminRole } from "@/lib/roles-client";

interface Collection {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  accessType: string;
  creatorFid: number;
  autoCurationEnabled: boolean;
}

interface SelectedCast {
  castHash: string;
  castData: any;
}

interface BulkCollectionSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCasts: SelectedCast[];
  defaultCollectionName?: string;
  onSuccess?: () => void;
}

// Sanitize display name for collection name
function sanitizeCollectionName(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

export function BulkCollectionSelectModal({
  isOpen,
  onClose,
  selectedCasts,
  defaultCollectionName,
  onSuccess,
}: BulkCollectionSelectModalProps) {
  const { user } = useNeynarContext();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOpenCollections, setShowOpenCollections] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [canCreateCollections, setCanCreateCollections] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(true);

  // Form state for creating new collection
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDisplayName, setNewCollectionDisplayName] = useState("");
  const [newCollectionDescription, setNewCollectionDescription] = useState("");
  const [newCollectionAccessType, setNewCollectionAccessType] = useState<"open" | "gated_user">("gated_user");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Check if user can create collections
  useEffect(() => {
    if (!isOpen || !user?.fid) {
      setCanCreateCollections(false);
      setCheckingPermissions(false);
      return;
    }

    const checkPermissions = async () => {
      try {
        setCheckingPermissions(true);
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          const roles = data.roles || [];
          setCanCreateCollections(hasCollectionsOrAdminRole(roles));
        }
      } catch (error) {
        console.error("Failed to check permissions:", error);
        setCanCreateCollections(false);
      } finally {
        setCheckingPermissions(false);
      }
    };

    checkPermissions();
  }, [isOpen, user?.fid]);

  // Fetch accessible collections
  useEffect(() => {
    if (!isOpen || !user?.fid || checkingPermissions) {
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
  }, [isOpen, user?.fid, checkingPermissions]);

  // Initialize default collection name when modal opens
  useEffect(() => {
    if (isOpen && defaultCollectionName && !newCollectionName) {
      const sanitized = sanitizeCollectionName(defaultCollectionName);
      setNewCollectionName(`${sanitized}-collection`);
      setNewCollectionDisplayName(`${defaultCollectionName} Collection`);
    }
  }, [isOpen, defaultCollectionName]);

  // Separate collections into user's collections and open collections
  const userCollections = collections.filter(
    (c) => {
      const isUserCreated = c.creatorFid === user?.fid;
      const hasGatedAccess = c.accessType !== "open";
      return (isUserCreated || hasGatedAccess) && !c.autoCurationEnabled;
    }
  );

  const openCollections = collections.filter(
    (c) => c.accessType === "open" && c.creatorFid !== user?.fid && !c.autoCurationEnabled
  );

  // Handle creating a new collection
  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!newCollectionName.trim() || !user?.fid) {
      return;
    }

    setIsCreatingCollection(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminFid: user.fid,
          name: newCollectionName.trim(),
          displayName: newCollectionDisplayName.trim() || null,
          description: newCollectionDescription.trim() || null,
          accessType: newCollectionAccessType,
          gatedUserId: newCollectionAccessType === "gated_user" ? user.fid : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create collection");
      }

      const data = await response.json();
      setSelectedCollection(data.collection.name);
      setShowCreateForm(false);
      setNewCollectionName("");
      setNewCollectionDisplayName("");
      setNewCollectionDescription("");
      setNewCollectionAccessType("gated_user");

      // Refresh collections list
      const refreshResponse = await fetch(`/api/collections?userFid=${user.fid}`);
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        setCollections(refreshData.collections || []);
      }
    } catch (error: any) {
      setCreateError(error.message || "Failed to create collection");
    } finally {
      setIsCreatingCollection(false);
    }
  };

  // Handle bulk add to collection
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting || !selectedCollection || !user?.fid || selectedCasts.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const castHashes = selectedCasts.map((c) => c.castHash);
      const castDataArray = selectedCasts.map((c) => c.castData);

      const response = await fetch("/api/collections/bulk-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curatorFid: user.fid,
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
      
      // Show success message
      window.dispatchEvent(
        new CustomEvent("showToast", {
          detail: {
            message: data.message || `Added ${data.added} cast(s) to collection`,
            type: "success",
          },
        })
      );

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error: any) {
      setSubmitError(error.message || "Failed to add casts to collection");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowCreateForm(false);
      setCreateError(null);
      setSubmitError(null);
      setSelectedCollection(null);
      setShowOpenCollections(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (showCreateForm) {
          setShowCreateForm(false);
          setCreateError(null);
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose, showCreateForm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Add {selectedCasts.length} Cast{selectedCasts.length !== 1 ? "s" : ""} to Collection
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
            {/* Error message */}
            {submitError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
              </div>
            )}

            {/* User's Collections */}
            {loading || checkingPermissions ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                Loading collections...
              </div>
            ) : (
              <>
                {/* User's Collections Section */}
                {userCollections.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Your Collections
                    </div>
                    {userCollections.map((collection) => (
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
                )}

                {/* Create New Collection Button */}
                {canCreateCollections && !showCreateForm && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowCreateForm(true);
                    }}
                    className="w-full flex items-center gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:border-purple-500 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Create New Collection</span>
                  </button>
                )}

                {/* Create Collection Form */}
                {showCreateForm && (
                  <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Create New Collection
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateForm(false);
                          setCreateError(null);
                        }}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {createError && (
                      <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">
                        {createError}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Collection Name (required)
                      </label>
                      <input
                        type="text"
                        value={newCollectionName}
                        onChange={(e) => setNewCollectionName(e.target.value)}
                        placeholder="my-collection"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Lowercase, hyphens only. Used in URLs.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Display Name (optional)
                      </label>
                      <input
                        type="text"
                        value={newCollectionDisplayName}
                        onChange={(e) => setNewCollectionDisplayName(e.target.value)}
                        placeholder="My Collection"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description (optional)
                      </label>
                      <textarea
                        value={newCollectionDescription}
                        onChange={(e) => setNewCollectionDescription(e.target.value)}
                        placeholder="Describe this collection..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Access Type
                      </label>
                      <select
                        value={newCollectionAccessType}
                        onChange={(e) => setNewCollectionAccessType(e.target.value as "open" | "gated_user")}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="gated_user">Gated (Only You)</option>
                        <option value="open">Open (Public)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateCollection}
                      disabled={isCreatingCollection || !newCollectionName.trim()}
                      className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingCollection ? "Creating..." : "Create Collection"}
                    </button>
                  </div>
                )}

                {/* Open Collections Section */}
                {openCollections.length > 0 && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowOpenCollections(!showOpenCollections)}
                      className="flex items-center justify-between w-full text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      <span>Open Collections ({openCollections.length})</span>
                      {showOpenCollections ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    {showOpenCollections && (
                      <div className="space-y-2">
                        {openCollections.map((collection) => (
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
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Submit Button */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedCollection || selectedCasts.length === 0}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Adding..." : "Add to Collection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



