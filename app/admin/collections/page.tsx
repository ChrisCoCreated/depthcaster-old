"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
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
  createdAt: string;
  updatedAt: string;
}

export default function AdminCollectionsPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
          loadCollections();
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

  const loadCollections = async () => {
    if (!user?.fid) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/collections?userFid=${user.fid}`);
      const data = await response.json();
      setCollections(data.collections || []);
    } catch (error) {
      console.error("Failed to load collections:", error);
      setError("Failed to load collections");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (collectionName: string) => {
    if (!user?.fid) return;
    if (!confirm(`Are you sure you want to delete collection "${collectionName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/collections/${encodeURIComponent(collectionName)}/manage?adminFid=${user.fid}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete collection");
      }

      setSuccess("Collection deleted successfully");
      loadCollections();
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      setError(error.message || "Failed to delete collection");
      setTimeout(() => setError(null), 5000);
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
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Collections Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Create and manage collections for organizing curated casts
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Collection
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-800 dark:text-green-200">
          {success}
        </div>
      )}

      {showCreateModal && (
        <CollectionModal
          userFid={user.fid}
          onClose={() => {
            setShowCreateModal(false);
            setEditingCollection(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setEditingCollection(null);
            setSuccess("Collection created successfully");
            setTimeout(() => setSuccess(null), 3000);
            loadCollections();
          }}
          onError={(err) => {
            setError(err);
            setTimeout(() => setError(null), 5000);
          }}
        />
      )}

      {editingCollection && (
        <CollectionModal
          userFid={user.fid}
          collection={editingCollection}
          onClose={() => {
            setEditingCollection(null);
          }}
          onSuccess={() => {
            setEditingCollection(null);
            setSuccess("Collection updated successfully");
            setTimeout(() => setSuccess(null), 3000);
            loadCollections();
          }}
          onError={(err) => {
            setError(err);
            setTimeout(() => setError(null), 5000);
          }}
        />
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading collections...</div>
        ) : collections.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No collections found. Create your first collection to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Display Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Access Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Display Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Auto-Curation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {collections.map((collection) => (
                  <tr key={collection.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {collection.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        /collection/{collection.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {collection.displayName || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200">
                        {collection.accessType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {collection.displayType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {collection.autoCurationEnabled ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
                          Enabled
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/collection/${collection.name}`}
                          target="_blank"
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => setEditingCollection(collection)}
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(collection.name)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CollectionModal({
  userFid,
  collection,
  onClose,
  onSuccess,
  onError,
}: {
  userFid: number;
  collection?: Collection;
  onClose: () => void;
  onSuccess: () => void;
  onError: (error: string) => void;
}) {
  const [formData, setFormData] = useState({
    name: collection?.name || "",
    displayName: collection?.displayName || "",
    description: collection?.description || "",
    accessType: collection?.accessType || "open",
    gatedUserId: collection?.gatedUserId?.toString() || "",
    gatingRule: collection?.gatingRule || null,
    displayType: collection?.displayType || "text",
    autoCurationEnabled: collection?.autoCurationEnabled || false,
    autoCurationRules: collection?.autoCurationRules || null,
    displayMode: collection?.displayMode || null,
    headerConfig: collection?.headerConfig || null,
  });

  const [gatingRuleType, setGatingRuleType] = useState<GatingRule["type"] | "">(
    collection?.gatingRule?.type || ""
  );
  const [gatingRuleEmoji, setGatingRuleEmoji] = useState(collection?.gatingRule?.emoji || "");
  const [gatingRuleRole, setGatingRuleRole] = useState(collection?.gatingRule?.role || "");
  const [gatingRuleFid, setGatingRuleFid] = useState(collection?.gatingRule?.fid?.toString() || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      let gatingRule: GatingRule | null = null;
      if (formData.accessType === "gated_rule") {
        if (!gatingRuleType) {
          throw new Error("Gating rule type is required");
        }
        gatingRule = {
          type: gatingRuleType as GatingRule["type"],
          ...(gatingRuleType === "display_name_contains_emoji" && { emoji: gatingRuleEmoji }),
          ...(gatingRuleType === "has_role" && { role: gatingRuleRole }),
          ...(gatingRuleType === "user_fid" && { fid: parseInt(gatingRuleFid) }),
        };
      }

      const payload = {
        adminFid: userFid,
        name: formData.name,
        displayName: formData.displayName || null,
        description: formData.description || null,
        accessType: formData.accessType,
        gatedUserId: formData.accessType === "gated_user" ? parseInt(formData.gatedUserId) : null,
        gatingRule: gatingRule,
        displayType: formData.displayType,
        autoCurationEnabled: formData.autoCurationEnabled,
        autoCurationRules: formData.autoCurationRules,
        displayMode: formData.displayMode,
        headerConfig: formData.headerConfig,
      };

      const url = collection
        ? `/api/collections/${encodeURIComponent(collection.name)}/manage`
        : "/api/collections";
      const method = collection ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save collection");
      }

      onSuccess();
    } catch (error: any) {
      onError(error.message || "Failed to save collection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {collection ? "Edit Collection" : "Create Collection"}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name (URL-friendly, unique) *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                disabled={!!collection}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="my-collection"
              />
              {collection && (
                <p className="mt-1 text-xs text-gray-500">Name cannot be changed after creation</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="My Collection"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="A collection of amazing casts..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Access Type *
              </label>
              <select
                value={formData.accessType}
                onChange={(e) => setFormData({ ...formData, accessType: e.target.value as any })}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="open">Open (anyone can add)</option>
                <option value="gated_user">Gated to specific user</option>
                <option value="gated_rule">Gated by rule</option>
              </select>
            </div>

            {formData.accessType === "gated_user" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Gated User FID *
                </label>
                <input
                  type="number"
                  value={formData.gatedUserId}
                  onChange={(e) => setFormData({ ...formData, gatedUserId: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="12345"
                />
              </div>
            )}

            {formData.accessType === "gated_rule" && (
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Gating Rule Type *
                </label>
                <select
                  value={gatingRuleType}
                  onChange={(e) => setGatingRuleType(e.target.value as GatingRule["type"] | "")}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Select rule type...</option>
                  <option value="display_name_contains_emoji">Display name contains emoji</option>
                  <option value="has_role">Has role</option>
                  <option value="user_fid">User FID matches</option>
                </select>

                {gatingRuleType === "display_name_contains_emoji" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Emoji *
                    </label>
                    <input
                      type="text"
                      value={gatingRuleEmoji}
                      onChange={(e) => setGatingRuleEmoji(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="🎥"
                    />
                  </div>
                )}

                {gatingRuleType === "has_role" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Role *
                    </label>
                    <input
                      type="text"
                      value={gatingRuleRole}
                      onChange={(e) => setGatingRuleRole(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="curator"
                    />
                  </div>
                )}

                {gatingRuleType === "user_fid" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      User FID *
                    </label>
                    <input
                      type="number"
                      value={gatingRuleFid}
                      onChange={(e) => setGatingRuleFid(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="12345"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Type *
              </label>
              <select
                value={formData.displayType}
                onChange={(e) => setFormData({ ...formData, displayType: e.target.value as any })}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="text">Text (standard feed)</option>
                <option value="image">Image (gallery only)</option>
                <option value="image-text">Image & Text (image prominent)</option>
              </select>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="autoCurationEnabled"
                checked={formData.autoCurationEnabled}
                onChange={(e) => setFormData({ ...formData, autoCurationEnabled: e.target.checked })}
                className="mr-2"
              />
              <label htmlFor="autoCurationEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable Auto-Curation
              </label>
            </div>

            {formData.autoCurationEnabled && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Auto-curation rules can be configured via the API. This feature will be enhanced in a future update.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : collection ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

