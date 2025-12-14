"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GatingRule } from "@/lib/collection-gating";
import { extractCastHashFromUrl } from "@/lib/link-converter";

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

export default function AdminCollectionsPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [managingCollection, setManagingCollection] = useState<Collection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoCuratingCollection, setAutoCuratingCollection] = useState<string | null>(null);

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
    setError(null);
    try {
      const response = await fetch(`/api/collections?userFid=${user.fid}`);
      
      // Log response details
      console.log("[Frontend] Collections API response:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: response.url
      });
      
      const data = await response.json();
      
      // Log response data
      console.log("[Frontend] Collections API data:", data);
      
      if (!response.ok) {
        // Log error response details
        console.error("[Frontend] Collections API error response:", {
          status: response.status,
          statusText: response.statusText,
          error: data.error,
          code: data.code,
          hint: data.hint,
          fullData: data
        });
        setError(data.error || `Failed to load collections (${response.status})`);
        return;
      }
      
      setCollections(data.collections || []);
    } catch (error) {
      // Log full error details
      console.error("[Frontend] Failed to load collections - exception:", {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      setError(error instanceof Error ? error.message : "Failed to load collections");
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

  const handleAutoCurate = async (collection: Collection) => {
    if (!user?.fid) return;
    if (!collection.autoCurationEnabled) {
      setError("Auto-curation is not enabled for this collection");
      setTimeout(() => setError(null), 5000);
      return;
    }

    setAutoCuratingCollection(collection.name);
    try {
      const response = await fetch(`/api/collections/${encodeURIComponent(collection.name)}/auto-curate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminFid: user.fid }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to run auto-curation");
      }

      const data = await response.json();
      setSuccess(data.message || `Auto-curation completed: ${data.added} cast(s) added`);
      loadCollections();
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(error.message || "Failed to run auto-curation");
      setTimeout(() => setError(null), 5000);
    } finally {
      setAutoCuratingCollection(null);
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
          }}
          onSuccess={() => {
            setShowCreateModal(false);
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

      {managingCollection && (
        <ManageCastsModal
          userFid={user.fid}
          collection={managingCollection}
          onClose={() => {
            setManagingCollection(null);
          }}
          onError={(err) => {
            setError(err);
            setTimeout(() => setError(null), 5000);
          }}
          onSuccess={(msg) => {
            setSuccess(msg);
            setTimeout(() => setSuccess(null), 3000);
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/collection/${collection.name}`}
                          target="_blank"
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => setManagingCollection(collection)}
                          className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300"
                        >
                          Manage Casts
                        </button>
                        {collection.autoCurationEnabled && (
                          <button
                            onClick={() => handleAutoCurate(collection)}
                            disabled={autoCuratingCollection === collection.name}
                            className="text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {autoCuratingCollection === collection.name ? "Curating..." : "Auto Curate Now"}
                          </button>
                        )}
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
    gatedUserId: collection?.gatedUserId?.toString() || (collection ? "" : userFid.toString()),
    gatingRule: collection?.gatingRule || null,
    displayType: collection?.displayType || "text",
    autoCurationEnabled: collection?.autoCurationEnabled || false,
    autoCurationRules: collection?.autoCurationRules || null,
    displayMode: collection?.displayMode || null,
    headerConfig: collection?.headerConfig || null,
    hiddenEmbedUrls: (collection?.hiddenEmbedUrls as string[] | null) || [],
    orderMode: (collection?.orderMode || "manual") as "manual" | "auto",
    orderDirection: (collection?.orderDirection || "desc") as "asc" | "desc",
  });
  
  const [expandMentionedProfiles, setExpandMentionedProfiles] = useState(
    (collection?.displayMode as any)?.expandMentionedProfiles || false
  );
  const [mentionedProfilesStyle, setMentionedProfilesStyle] = useState<"full" | "minicard">(
    (collection?.displayMode as any)?.mentionedProfilesStyle || "full"
  );
  const [mentionedProfilesPosition, setMentionedProfilesPosition] = useState<"above" | "below">(
    (collection?.displayMode as any)?.mentionedProfilesPosition || "below"
  );
  const [hiddenEmbedUrlsText, setHiddenEmbedUrlsText] = useState(
    collection?.hiddenEmbedUrls ? (collection.hiddenEmbedUrls as string[]).join('\n') : ""
  );

  // Display Mode state
  const existingDisplayMode = (collection?.displayMode as any) || {};
  const [displayModeEnabled, setDisplayModeEnabled] = useState(!!collection?.displayMode);
  const [replaceEmbeds, setReplaceEmbeds] = useState(existingDisplayMode.replaceEmbeds || false);
  const [embedButtonText, setEmbedButtonText] = useState(existingDisplayMode.embedButtonText || "");
  const [embedButtonAction, setEmbedButtonAction] = useState<"open-link" | "custom">(
    existingDisplayMode.embedButtonAction || "open-link"
  );
  const [hideChannelLink, setHideChannelLink] = useState(existingDisplayMode.hideChannelLink || false);
  const [hideUrlLinks, setHideUrlLinks] = useState(existingDisplayMode.hideUrlLinks || false);
  // Backward compatibility: if hideAuthorInfo exists but new options don't, initialize from it
  const [hideAuthorInfo, setHideAuthorInfo] = useState(existingDisplayMode.hideAuthorInfo || false);
  const [hideAuthorDisplayName, setHideAuthorDisplayName] = useState(
    existingDisplayMode.hideAuthorDisplayName ?? (existingDisplayMode.hideAuthorInfo ? true : false)
  );
  const [hideAuthorUsername, setHideAuthorUsername] = useState(
    existingDisplayMode.hideAuthorUsername ?? (existingDisplayMode.hideAuthorInfo ? true : false)
  );
  const [hideAuthorPfp, setHideAuthorPfp] = useState(
    existingDisplayMode.hideAuthorPfp ?? (existingDisplayMode.hideAuthorInfo ? true : false)
  );
  // Handle both single string (backward compatible) and array for stripTextPrefix
  const [stripTextPrefixes, setStripTextPrefixes] = useState<string[]>(() => {
    const prefix = existingDisplayMode.stripTextPrefix;
    if (!prefix) return [];
    return Array.isArray(prefix) ? prefix : [prefix];
  });
  const [replaceCharacters, setReplaceCharacters] = useState<Array<{ from: string; to: string }>>(
    existingDisplayMode.replaceCharacters || []
  );
  const [boldFirstLine, setBoldFirstLine] = useState(existingDisplayMode.boldFirstLine || false);
  const [buttonBackgroundColor, setButtonBackgroundColor] = useState(
    existingDisplayMode.buttonBackgroundColor || "#000000"
  );
  const [buttonTextColor, setButtonTextColor] = useState(
    existingDisplayMode.buttonTextColor || "#ffffff"
  );
  const [hideCuratedButton, setHideCuratedButton] = useState(existingDisplayMode.hideCuratedButton || false);
  const [hideShareButton, setHideShareButton] = useState(existingDisplayMode.hideShareButton || false);

  // Header Config state
  const existingHeaderConfig = (collection?.headerConfig as any) || {};
  const [headerConfigEnabled, setHeaderConfigEnabled] = useState(!!collection?.headerConfig);
  const [showChannelHeader, setShowChannelHeader] = useState(existingHeaderConfig.showChannelHeader || false);
  const [customTitle, setCustomTitle] = useState(existingHeaderConfig.customTitle || "");
  const [customDescription, setCustomDescription] = useState(existingHeaderConfig.customDescription || "");
  const [headerImage, setHeaderImage] = useState(existingHeaderConfig.headerImage || "");

  const [gatingRuleType, setGatingRuleType] = useState<GatingRule["type"] | "">(
    collection?.gatingRule?.type || ""
  );
  const [gatingRuleEmoji, setGatingRuleEmoji] = useState(collection?.gatingRule?.emoji || "");
  const [gatingRuleRole, setGatingRuleRole] = useState(collection?.gatingRule?.role || "");
  const [gatingRuleFid, setGatingRuleFid] = useState(collection?.gatingRule?.fid?.toString() || "");
  const [saving, setSaving] = useState(false);

  // Auto-curation state
  const existingAutoCurationRules = collection?.autoCurationRules as any;
  const [autoCurationFeedType, setAutoCurationFeedType] = useState<"channel" | "fids" | null>(
    existingAutoCurationRules?.feedType || null
  );
  const [autoCurationChannelId, setAutoCurationChannelId] = useState(
    existingAutoCurationRules?.feedType === "channel" 
      ? (existingAutoCurationRules?.feedConfig as any)?.channelId || ""
      : ""
  );
  const [autoCurationFids, setAutoCurationFids] = useState(
    existingAutoCurationRules?.feedType === "fids"
      ? (existingAutoCurationRules?.feedConfig as any)?.fids?.join(", ") || ""
      : ""
  );
  const [autoCurationFilters, setAutoCurationFilters] = useState<Array<{ type: string; value: any }>>(
    existingAutoCurationRules?.filters || []
  );

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
          ...(gatingRuleType === "display_name_contains_emoji" ? { emoji: gatingRuleEmoji } : {}),
          ...(gatingRuleType === "has_role" ? { role: gatingRuleRole } : {}),
          ...(gatingRuleType === "user_fid" ? { fid: parseInt(gatingRuleFid) } : {}),
        };
      }

      // Convert hiddenEmbedUrls text (newline-separated) to array
      const hiddenEmbedUrlsArray = hiddenEmbedUrlsText
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0);

      // Build displayMode object
      const updatedDisplayMode = displayModeEnabled ? {
        replaceEmbeds,
        embedButtonText: replaceEmbeds ? embedButtonText : undefined,
        embedButtonAction: replaceEmbeds ? embedButtonAction : undefined,
        hideChannelLink,
        hideUrlLinks,
        hideAuthorInfo: (() => {
          // Only set hideAuthorInfo for backward compatibility if all three are set
          if (hideAuthorDisplayName && hideAuthorUsername && hideAuthorPfp) {
            return true;
          }
          return undefined; // Don't set it if using new granular options
        })(),
        hideAuthorDisplayName,
        hideAuthorUsername,
        hideAuthorPfp,
        stripTextPrefix: (() => {
          const nonEmptyPrefixes = stripTextPrefixes.filter(p => p.trim().length > 0);
          if (nonEmptyPrefixes.length === 0) return undefined;
          // For backward compatibility, return single string if only one prefix, otherwise return array
          return nonEmptyPrefixes.length === 1 ? nonEmptyPrefixes[0] : nonEmptyPrefixes;
        })(),
        replaceCharacters: (() => {
          const nonEmptyReplacements = replaceCharacters.filter(r => r.from && r.to !== undefined);
          return nonEmptyReplacements.length > 0 ? nonEmptyReplacements : undefined;
        })(),
        boldFirstLine,
        buttonBackgroundColor: replaceEmbeds ? buttonBackgroundColor : undefined,
        buttonTextColor: replaceEmbeds ? buttonTextColor : undefined,
        expandMentionedProfiles,
        mentionedProfilesStyle: expandMentionedProfiles ? mentionedProfilesStyle : undefined,
        mentionedProfilesPosition: expandMentionedProfiles ? mentionedProfilesPosition : undefined,
        hideCuratedButton,
        hideShareButton,
      } : null;

      // Build headerConfig object
      const updatedHeaderConfig = headerConfigEnabled ? {
        showChannelHeader,
        customTitle: customTitle || undefined,
        customDescription: customDescription || undefined,
        headerImage: headerImage || undefined,
      } : null;

      // Build autoCurationRules if enabled
      let autoCurationRules: any = null;
      if (formData.autoCurationEnabled && autoCurationFeedType) {
        if (autoCurationFeedType === "channel") {
          if (!autoCurationChannelId.trim()) {
            throw new Error("Channel ID is required when auto-curation is enabled");
          }
          autoCurationRules = {
            feedType: "channel",
            feedConfig: {
              channelId: autoCurationChannelId.trim(),
            },
            filters: autoCurationFilters.length > 0 ? autoCurationFilters : undefined,
          };
        } else if (autoCurationFeedType === "fids") {
          if (!autoCurationFids.trim()) {
            throw new Error("FIDs are required when auto-curation is enabled");
          }
          const fidsArray = autoCurationFids
            .split(",")
            .map((f: string) => parseInt(f.trim()))
            .filter((f: number) => !isNaN(f));
          if (fidsArray.length === 0) {
            throw new Error("At least one valid FID is required");
          }
          autoCurationRules = {
            feedType: "fids",
            feedConfig: {
              fids: fidsArray,
            },
            filters: autoCurationFilters.length > 0 ? autoCurationFilters : undefined,
          };
        }
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
        autoCurationRules: autoCurationRules,
        displayMode: updatedDisplayMode,
        headerConfig: updatedHeaderConfig,
        hiddenEmbedUrls: hiddenEmbedUrlsArray.length > 0 ? hiddenEmbedUrlsArray : null,
        orderMode: formData.orderMode,
        orderDirection: formData.orderDirection,
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
                Display Name
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => {
                  const newDisplayName = e.target.value;
                  setFormData({ 
                    ...formData, 
                    displayName: newDisplayName,
                    // Auto-generate name from display name when creating (not editing)
                    name: !collection ? newDisplayName
                      .toLowerCase()
                      .trim()
                      .replace(/\s+/g, '-')
                      .replace(/[^a-z0-9-]/g, '')
                      .replace(/-+/g, '-')
                      .replace(/^-|-$/g, '') : formData.name
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="My Collection"
              />
            </div>

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
              {!collection && (
                <p className="mt-1 text-xs text-gray-500">Auto-generated from display name. You can edit it manually.</p>
              )}
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
                onChange={(e) => {
                  const newAccessType = e.target.value as any;
                  setFormData({ 
                    ...formData, 
                    accessType: newAccessType,
                    // Default to user's FID when switching to gated_user (if not editing or field is empty)
                    gatedUserId: newAccessType === "gated_user" && (!collection || !formData.gatedUserId) 
                      ? userFid.toString() 
                      : formData.gatedUserId
                  });
                }}
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
                  Only I can edit *
                </label>
                <input
                  type="number"
                  value={formData.gatedUserId}
                  onChange={(e) => setFormData({ ...formData, gatedUserId: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder={userFid.toString()}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  User FID who can add casts to this collection. Defaults to your FID.
                </p>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Hidden Embed URLs
              </label>
              <textarea
                value={hiddenEmbedUrlsText}
                onChange={(e) => setHiddenEmbedUrlsText(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm"
                placeholder="youtube.com&#10;twitter.com&#10;https://example.com/video&#10;0x1234567890abcdef..."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Enter URLs, domains, or cast hashes to hide embeds from. One per line. Supports domains (e.g., 'youtube.com'), full URLs, or cast hashes (e.g., '0x1234...'). Casts will still be displayed, but matching embeds will be hidden.
              </p>
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

            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="expandMentionedProfiles"
                  checked={expandMentionedProfiles}
                  onChange={(e) => setExpandMentionedProfiles(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="expandMentionedProfiles" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Expand Mentioned Profiles
                </label>
                <p className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  Show profile cards for mentioned profiles in casts
                </p>
              </div>
              
              {expandMentionedProfiles && (
                <div className="pl-6 space-y-3 border-l-2 border-gray-300 dark:border-gray-600">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Profile Card Style
                    </label>
                    <select
                      value={mentionedProfilesStyle}
                      onChange={(e) => setMentionedProfilesStyle(e.target.value as "full" | "minicard")}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="full">Full Width (banner, bio, stats)</option>
                      <option value="minicard">Minicard (compact, 2 columns)</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Position Relative to Embeds
                    </label>
                    <select
                      value={mentionedProfilesPosition}
                      onChange={(e) => setMentionedProfilesPosition(e.target.value as "above" | "below")}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="below">Below Embeds (default)</option>
                      <option value="above">Above Embeds</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Display Mode Settings */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    id="displayModeEnabled"
                    checked={displayModeEnabled}
                    onChange={(e) => setDisplayModeEnabled(e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Display Mode
                  </span>
                </label>
              </div>

              {displayModeEnabled && (
                <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="replaceEmbeds"
                      checked={replaceEmbeds}
                      onChange={(e) => setReplaceEmbeds(e.target.checked)}
                      className="mr-2"
                    />
                    <label htmlFor="replaceEmbeds" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Replace Embeds with Button
                    </label>
                    <p className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      Replace embed previews with a custom button
                    </p>
                  </div>

                  {replaceEmbeds && (
                    <div className="space-y-3 pl-6 border-l-2 border-gray-300 dark:border-gray-600">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Button Text
                        </label>
                        <input
                          type="text"
                          value={embedButtonText}
                          onChange={(e) => setEmbedButtonText(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                          placeholder="e.g., Open this Reframe"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Button Action
                        </label>
                        <select
                          value={embedButtonAction}
                          onChange={(e) => setEmbedButtonAction(e.target.value as "open-link" | "custom")}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                        >
                          <option value="open-link">Open Link</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Button Background Color
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={buttonBackgroundColor}
                              onChange={(e) => setButtonBackgroundColor(e.target.value)}
                              className="h-10 w-20 border border-gray-300 dark:border-gray-700 rounded cursor-pointer"
                            />
                            <input
                              type="text"
                              value={buttonBackgroundColor}
                              onChange={(e) => setButtonBackgroundColor(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm font-mono"
                              placeholder="#000000"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Button Text Color
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={buttonTextColor}
                              onChange={(e) => setButtonTextColor(e.target.value)}
                              className="h-10 w-20 border border-gray-300 dark:border-gray-700 rounded cursor-pointer"
                            />
                            <input
                              type="text"
                              value={buttonTextColor}
                              onChange={(e) => setButtonTextColor(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm font-mono"
                              placeholder="#ffffff"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="hideChannelLink"
                      checked={hideChannelLink}
                      onChange={(e) => setHideChannelLink(e.target.checked)}
                      className="mr-2"
                    />
                    <label htmlFor="hideChannelLink" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Hide Channel Link
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="hideUrlLinks"
                      checked={hideUrlLinks}
                      onChange={(e) => setHideUrlLinks(e.target.checked)}
                      className="mr-2"
                    />
                    <label htmlFor="hideUrlLinks" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Hide URL Links
                    </label>
                    <p className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      Hide clickable URL links in cast text
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="hideAuthorDisplayName"
                        checked={hideAuthorDisplayName}
                        onChange={(e) => setHideAuthorDisplayName(e.target.checked)}
                        className="mr-2"
                      />
                      <label htmlFor="hideAuthorDisplayName" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Hide Author Display Name
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="hideAuthorUsername"
                        checked={hideAuthorUsername}
                        onChange={(e) => setHideAuthorUsername(e.target.checked)}
                        className="mr-2"
                      />
                      <label htmlFor="hideAuthorUsername" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Hide Author Username
                      </label>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="hideAuthorPfp"
                        checked={hideAuthorPfp}
                        onChange={(e) => setHideAuthorPfp(e.target.checked)}
                        className="mr-2"
                      />
                      <label htmlFor="hideAuthorPfp" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Hide Author Profile Picture
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Strip Text Prefixes
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setStripTextPrefixes([...stripTextPrefixes, ""]);
                        }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        + Add Prefix
                      </button>
                    </div>
                    {stripTextPrefixes.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        No prefixes. Add one to remove prefixes from the beginning of cast text.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {stripTextPrefixes.map((prefix, index) => (
                          <div key={index} className="flex gap-2 items-start">
                            <input
                              type="text"
                              value={prefix}
                              onChange={(e) => {
                                const newPrefixes = [...stripTextPrefixes];
                                newPrefixes[index] = e.target.value;
                                setStripTextPrefixes(newPrefixes);
                              }}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                              placeholder="e.g., Reframe Daily: "
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setStripTextPrefixes(stripTextPrefixes.filter((_, i) => i !== index));
                              }}
                              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm px-2"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Remove these prefixes from the beginning of cast text. The first matching prefix will be removed.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Replace Characters
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setReplaceCharacters([...replaceCharacters, { from: "", to: "" }]);
                        }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        + Add Replacement
                      </button>
                    </div>
                    {replaceCharacters.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        No replacements. Add one to replace characters in cast text (e.g., replace ";" with newline).
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {replaceCharacters.map((replacement, index) => (
                          <div key={index} className="flex gap-2 items-start p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded">
                            <div className="flex-1 grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                  From
                                </label>
                                <input
                                  type="text"
                                  value={replacement.from}
                                  onChange={(e) => {
                                    const newReplacements = [...replaceCharacters];
                                    newReplacements[index] = { ...newReplacements[index], from: e.target.value };
                                    setReplaceCharacters(newReplacements);
                                  }}
                                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                                  placeholder="e.g., ;"
                                  maxLength={10}
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                  To
                                </label>
                                <input
                                  type="text"
                                  value={replacement.to}
                                  onChange={(e) => {
                                    const newReplacements = [...replaceCharacters];
                                    newReplacements[index] = { ...newReplacements[index], to: e.target.value };
                                    setReplaceCharacters(newReplacements);
                                  }}
                                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                                  placeholder="\\n for newline"
                                  maxLength={10}
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setReplaceCharacters(replaceCharacters.filter((_, i) => i !== index));
                              }}
                              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm px-2 self-end"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Replace characters in cast text. Use "\\n" in the "To" field for newlines. All occurrences will be replaced.
                    </p>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="boldFirstLine"
                      checked={boldFirstLine}
                      onChange={(e) => setBoldFirstLine(e.target.checked)}
                      className="mr-2"
                    />
                    <label htmlFor="boldFirstLine" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Bold First Line
                    </label>
                    <p className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      Make the first line of cast text bold
                    </p>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="hideCuratedButton"
                      checked={hideCuratedButton}
                      onChange={(e) => setHideCuratedButton(e.target.checked)}
                      className="mr-2"
                    />
                    <label htmlFor="hideCuratedButton" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Hide Curated By Details
                    </label>
                    <p className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      Hide the "Curated by" pill showing curator information
                    </p>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="hideShareButton"
                      checked={hideShareButton}
                      onChange={(e) => setHideShareButton(e.target.checked)}
                      className="mr-2"
                    />
                    <label htmlFor="hideShareButton" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Hide Share Button
                    </label>
                    <p className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      Hide the share button on cast cards
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Header Configuration */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    id="headerConfigEnabled"
                    checked={headerConfigEnabled}
                    onChange={(e) => setHeaderConfigEnabled(e.target.checked)}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Header Configuration
                  </span>
                </label>
              </div>

              {headerConfigEnabled && (
                <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showChannelHeader"
                      checked={showChannelHeader}
                      onChange={(e) => setShowChannelHeader(e.target.checked)}
                      className="mr-2"
                    />
                    <label htmlFor="showChannelHeader" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Show Channel Header
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Custom Title
                    </label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                      placeholder="e.g., Reframe Daily"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Custom title to display instead of collection name
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Custom Description
                    </label>
                    <textarea
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                      placeholder="Optional description text"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Header Image URL
                    </label>
                    <input
                      type="text"
                      value={headerImage}
                      onChange={(e) => setHeaderImage(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                      placeholder="e.g., /images/instructions/reframebanner.jpg"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      URL or path to header image (relative to public folder or absolute URL)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {formData.autoCurationEnabled && (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Feed Type *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="autoCurationFeedType"
                        value="channel"
                        checked={autoCurationFeedType === "channel"}
                        onChange={(e) => {
                          setAutoCurationFeedType("channel");
                          setAutoCurationFids("");
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Channel</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="autoCurationFeedType"
                        value="fids"
                        checked={autoCurationFeedType === "fids"}
                        onChange={(e) => {
                          setAutoCurationFeedType("fids");
                          setAutoCurationChannelId("");
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">FIDs</span>
                    </label>
                  </div>
                </div>

                {autoCurationFeedType === "channel" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Channel ID *
                    </label>
                    <input
                      type="text"
                      value={autoCurationChannelId}
                      onChange={(e) => setAutoCurationChannelId(e.target.value)}
                      required={formData.autoCurationEnabled}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="e.g., cryptosapiens"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      The channel ID to fetch casts from
                    </p>
                  </div>
                )}

                {autoCurationFeedType === "fids" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      FIDs (comma-separated) *
                    </label>
                    <input
                      type="text"
                      value={autoCurationFids}
                      onChange={(e) => setAutoCurationFids(e.target.value)}
                      required={formData.autoCurationEnabled}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="e.g., 123, 456, 789"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Comma-separated list of FIDs to fetch casts from
                    </p>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Filters (optional)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setAutoCurationFilters([...autoCurationFilters, { type: "authorFid", value: "" }]);
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      + Add Filter
                    </button>
                  </div>
                  {autoCurationFilters.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                      No filters. All casts from the feed will be included.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {autoCurationFilters.map((filter, index) => (
                        <div key={index} className="flex gap-2 items-start p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded">
                          <select
                            value={filter.type}
                            onChange={(e) => {
                              const newFilters = [...autoCurationFilters];
                              newFilters[index] = {
                                type: e.target.value,
                                value: e.target.value === "excludeRecasts" || e.target.value === "hasParagraphPost" ? true : "",
                              };
                              setAutoCurationFilters(newFilters);
                            }}
                            className="flex-shrink-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                          >
                            <option value="authorFid">Author FID</option>
                            <option value="excludeRecasts">Exclude Recasts</option>
                            <option value="minLength">Min Length</option>
                            <option value="hasParagraphPost">Has Paragraph Post</option>
                          </select>
                          {filter.type === "excludeRecasts" ? (
                            <div className="flex-1 flex items-center text-sm text-gray-600 dark:text-gray-400">
                              Excludes all recasts (casts with parent_hash)
                            </div>
                          ) : filter.type === "hasParagraphPost" ? (
                            <div className="flex-1 flex items-center text-sm text-gray-600 dark:text-gray-400">
                              Only includes casts with Paragraph post links (in embeds or text)
                            </div>
                          ) : filter.type === "authorFid" ? (
                            <input
                              type="text"
                              value={filter.value}
                              onChange={(e) => {
                                const newFilters = [...autoCurationFilters];
                                newFilters[index].value = e.target.value;
                                setAutoCurationFilters(newFilters);
                              }}
                              className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                              placeholder="@username or FID number"
                            />
                          ) : (
                            <input
                              type="number"
                              value={filter.value}
                              onChange={(e) => {
                                const newFilters = [...autoCurationFilters];
                                newFilters[index].value = parseInt(e.target.value) || 0;
                                setAutoCurationFilters(newFilters);
                              }}
                              className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                              placeholder="Minimum character length"
                              min="0"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setAutoCurationFilters(autoCurationFilters.filter((_, i) => i !== index));
                            }}
                            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Cast Ordering
                </label>
                <select
                  value={formData.orderMode}
                  onChange={(e) => setFormData({ ...formData, orderMode: e.target.value as "manual" | "auto" })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="manual">Manual (drag to reorder)</option>
                  <option value="auto">Auto (by cast timestamp)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {formData.orderMode === "manual"
                    ? "Casts can be manually reordered by dragging in the Manage Casts modal"
                    : "Casts are automatically ordered by timestamp. Manual reordering is disabled."}
                </p>
              </div>

              {formData.orderMode === "auto" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Order Direction
                  </label>
                  <select
                    value={formData.orderDirection}
                    onChange={(e) => setFormData({ ...formData, orderDirection: e.target.value as "asc" | "desc" })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="desc">Descending (newest first)</option>
                    <option value="asc">Ascending (oldest first)</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formData.orderDirection === "desc"
                      ? "Newest casts appear first"
                      : "Oldest casts appear first"}
                  </p>
                </div>
              )}
            </div>

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

function ManageCastsModal({
  userFid,
  collection,
  onClose,
  onError,
  onSuccess,
}: {
  userFid: number;
  collection: Collection;
  onClose: () => void;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [casts, setCasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [castHash, setCastHash] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  
  const isAutoOrdering = collection.orderMode === "auto";

  useEffect(() => {
    loadCasts();
  }, [collection.name]);

  const loadCasts = async (loadMore = false) => {
    try {
      const url = `/api/collections/${encodeURIComponent(collection.name)}?limit=25${loadMore && cursor ? `&cursor=${cursor}` : ""}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load casts");
      }

      if (loadMore) {
        setCasts([...casts, ...data.casts]);
      } else {
        setCasts(data.casts);
      }

      setCursor(data.next?.cursor || null);
      setHasMore(!!data.next?.cursor);
    } catch (error: any) {
      onError(error.message || "Failed to load casts");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCast = async () => {
    if (!castHash.trim()) {
      onError("Please enter a cast URL or hash");
      return;
    }

    setAdding(true);
    try {
      const input = castHash.trim();
      
      // Try to extract hash from URL if it's a known Farcaster URL format
      // This is faster than passing the full URL to the API
      const extractedHash = extractCastHashFromUrl(input);
      const identifier = extractedHash || input;
      const type = extractedHash ? "hash" : (input.startsWith("http://") || input.startsWith("https://") ? "url" : "hash");
      
      // Fetch cast data from Neynar
      const conversationResponse = await fetch(
        `/api/conversation?identifier=${encodeURIComponent(identifier)}&type=${type}&replyDepth=0`
      );

      if (!conversationResponse.ok) {
        const errorData = await conversationResponse.json();
        throw new Error(errorData.error || "Failed to fetch cast from Neynar");
      }

      const conversationData = await conversationResponse.json();
      const castData = conversationData?.conversation?.cast;

      if (!castData) {
        throw new Error("Cast not found");
      }

      // Add to collection
      const addResponse = await fetch(`/api/collections/${encodeURIComponent(collection.name)}/curate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          castHash: castData.hash,
          curatorFid: userFid,
          castData: castData,
        }),
      });

      if (!addResponse.ok) {
        const errorData = await addResponse.json();
        throw new Error(errorData.error || "Failed to add cast to collection");
      }

      setCastHash("");
      onSuccess("Cast added successfully");
      loadCasts();
    } catch (error: any) {
      onError(error.message || "Failed to add cast");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveCast = async (castHashToRemove: string) => {
    if (!confirm("Are you sure you want to remove this cast from the collection?")) {
      return;
    }

    try {
      const response = await fetch(
        `/api/collections/${encodeURIComponent(collection.name)}/curate?castHash=${encodeURIComponent(castHashToRemove)}&curatorFid=${userFid}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove cast");
      }

      onSuccess("Cast removed successfully");
      loadCasts();
    } catch (error: any) {
      onError(error.message || "Failed to remove cast");
    }
  };

  const handleDragStart = (index: number) => {
    if (isAutoOrdering) return;
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (isAutoOrdering) return;
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    if (isAutoOrdering) return;
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newCasts = [...casts];
    const draggedCast = newCasts[draggedIndex];
    newCasts.splice(draggedIndex, 1);
    newCasts.splice(dropIndex, 0, draggedCast);
    setCasts(newCasts);
    setDraggedIndex(null);
    setDragOverIndex(null);

    // Save new order to API
    setReordering(true);
    try {
      const castHashes = newCasts.map((cast) => cast.hash);
      const response = await fetch(`/api/collections/${encodeURIComponent(collection.name)}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminFid: userFid,
          castHashes: castHashes,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reorder casts");
      }

      onSuccess("Casts reordered successfully");
    } catch (error: any) {
      onError(error.message || "Failed to reorder casts");
      // Revert on error
      loadCasts();
    } finally {
      setReordering(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Manage Casts: {collection.displayName || collection.name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {isAutoOrdering
                  ? `Add or remove casts. Ordering is automatic (${collection.orderDirection === "desc" ? "newest first" : "oldest first"})`
                  : "Add, remove, or reorder casts by dragging"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={castHash}
              onChange={(e) => setCastHash(e.target.value)}
              placeholder="Enter cast URL or hash (0x...)"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleAddCast();
                }
              }}
            />
            <button
              onClick={handleAddCast}
              disabled={adding || !castHash.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? "Adding..." : "Add Cast"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center text-gray-500 py-8">Loading casts...</div>
          ) : casts.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No casts in this collection yet. Add one above to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {reordering && (
                <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
                  Saving new order...
                </div>
              )}
              {casts.map((cast, index) => (
                <div
                  key={cast.hash}
                  draggable={!isAutoOrdering}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`flex items-start justify-between p-4 border rounded-lg transition-colors ${
                    draggedIndex === index
                      ? "opacity-50 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                      : dragOverIndex === index
                      ? "border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
                  } ${draggedIndex !== null && !isAutoOrdering ? "cursor-move" : ""}`}
                >
                  <div className="flex items-start gap-3 flex-1">
                    {!isAutoOrdering && (
                      <div className="flex-shrink-0 mt-1 text-gray-400 dark:text-gray-500 cursor-move">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="opacity-50"
                        >
                          <path d="M7 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Link
                          href={`/cast/${cast.hash}`}
                          target="_blank"
                          className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {cast.hash.substring(0, 16)}...
                        </Link>
                      </div>
                      {cast.text && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                          {cast.text}
                        </p>
                      )}
                      {cast.author && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          by @{cast.author.username || cast.author.fid}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveCast(cast.hash)}
                    className="ml-4 px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {hasMore && (
                <button
                  onClick={() => loadCasts(true)}
                  className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                >
                  Load More
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

