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

  // Separate collections into user's collections and open collections
  // User's collections: collections user created OR has access to via gating (excluding auto ones)
  const userCollections = collections.filter(
    (c) => {
      const isUserCreated = c.creatorFid === user?.fid;
      const hasGatedAccess = c.accessType !== "open"; // gated_user or gated_rule collections user has access to
      return (isUserCreated || hasGatedAccess) && !c.autoCurationEnabled;
    }
  );
  
  // Open collections: open collections created by others (excluding auto ones)
  const openCollections = collections.filter(
    (c) => c.accessType === "open" && c.creatorFid !== user?.fid && !c.autoCurationEnabled
  );

  // Handle creating a new collection
  const handleCreateCollection = async (e: React.FormEvent) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:119',message:'handleCreateCollection called',data:{newCollectionName,userFid:user?.fid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'})}).catch(()=>{});
    // #endregion
    e.preventDefault();
    e.stopPropagation();
    
    if (!newCollectionName.trim() || !user?.fid) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:125',message:'Early return - missing name or user',data:{hasName:!!newCollectionName.trim(),hasUser:!!user?.fid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return;
    }

    setIsCreatingCollection(true);
    setCreateError(null);

    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:132',message:'Before API call',data:{name:newCollectionName.trim(),userFid:user.fid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
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

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:145',message:'API response received',data:{ok:response.ok,status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      if (!response.ok) {
        const data = await response.json();
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:150',message:'API error',data:{error:data.error,status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        throw new Error(data.error || "Failed to create collection");
      }

      const data = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:155',message:'Collection created successfully',data:{collectionName:data.collection?.name,collectionId:data.collection?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // Select the newly created collection
      setSelectedCollection(data.collection.name);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:160',message:'Selected collection set',data:{selectedCollection:data.collection.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      setShowCreateForm(false);
      setNewCollectionName("");
      setNewCollectionDisplayName("");
      setNewCollectionDescription("");
      setNewCollectionAccessType("gated_user"); // Reset to default
      
      // Refresh collections list
      const refreshResponse = await fetch(`/api/collections?userFid=${user.fid}`);
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        setCollections(refreshData.collections || []);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:170',message:'Collections refreshed',data:{collectionCount:refreshData.collections?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
      }
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:173',message:'Error caught',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setCreateError(error.message || "Failed to create collection");
    } finally {
      setIsCreatingCollection(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:178',message:'handleCreateCollection finished',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
      // #endregion
    }
  };

  // Handle selection
  const handleSubmit = async (e: React.FormEvent) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:169',message:'handleSubmit called',data:{selectedCollection,isSubmitting},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    e.preventDefault();
    
    if (isSubmitting) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:175',message:'Early return - already submitting',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return;
    }

    setIsSubmitting(true);
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:182',message:'Calling onSelect and onClose',data:{selectedCollection},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      onSelect(selectedCollection);
      onClose();
    } finally {
      setIsSubmitting(false);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/aacf9ca3-f70e-4e37-81d4-14d45a449972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CollectionSelectModal.tsx:189',message:'handleSubmit finished',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }
  };

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
            Add to Collection
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
                    <Plus className="w-4 h-4" />
                    <span className="font-medium">Create New Collection</span>
                  </button>
                )}

                {/* Create Collection Form */}
                {showCreateForm && canCreateCollections && (
                  <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Create New Collection
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateForm(false);
                          setCreateError(null);
                          setNewCollectionName("");
                          setNewCollectionDisplayName("");
                          setNewCollectionDescription("");
                        }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Name *
                        </label>
                        <input
                          type="text"
                          value={newCollectionName}
                          onChange={(e) => setNewCollectionName(e.target.value)}
                          placeholder="my-collection"
                          required
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={newCollectionDisplayName}
                          onChange={(e) => setNewCollectionDisplayName(e.target.value)}
                          placeholder="My Collection"
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Description
                        </label>
                        <textarea
                          value={newCollectionDescription}
                          onChange={(e) => setNewCollectionDescription(e.target.value)}
                          placeholder="A collection of interesting casts"
                          rows={2}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Who can add casts?
                        </label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 p-2 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                            <input
                              type="radio"
                              name="accessType"
                              value="gated_user"
                              checked={newCollectionAccessType === "gated_user"}
                              onChange={(e) => setNewCollectionAccessType(e.target.value as "gated_user")}
                              className="w-4 h-4 text-purple-600"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Only I can edit
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Only you can add casts to this collection
                              </div>
                            </div>
                          </label>
                          <label className="flex items-center gap-2 p-2 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                            <input
                              type="radio"
                              name="accessType"
                              value="open"
                              checked={newCollectionAccessType === "open"}
                              onChange={(e) => setNewCollectionAccessType(e.target.value as "open")}
                              className="w-4 h-4 text-purple-600"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Anyone can add
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Anyone can add casts to this collection
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>
                      {createError && (
                        <div className="text-xs text-red-600 dark:text-red-400">
                          {createError}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowCreateForm(false);
                            setCreateError(null);
                            setNewCollectionName("");
                            setNewCollectionDisplayName("");
                            setNewCollectionDescription("");
                            setNewCollectionAccessType("gated_user"); // Reset to default
                          }}
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCreateCollection(e as any);
                          }}
                          disabled={isCreatingCollection || !newCollectionName.trim()}
                          className="flex-1 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isCreatingCollection ? "Creating..." : "Create"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Open Collections Section */}
                {openCollections.length > 0 && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowOpenCollections(!showOpenCollections)}
                      className="w-full flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Open Collections ({openCollections.length})
                      </span>
                      {showOpenCollections ? (
                        <ChevronUp className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                    {showOpenCollections && (
                      <div className="space-y-2 pl-4">
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

                {/* No collections message */}
                {userCollections.length === 0 && openCollections.length === 0 && !canCreateCollections && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                    No collections available
                  </div>
                )}
              </>
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
              {isSubmitting ? "Adding..." : "Add to Collection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
