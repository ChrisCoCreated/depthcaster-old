"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { Plus, Edit2, Trash2, X, Save, ExternalLink, MessageSquare } from "lucide-react";
import Link from "next/link";
import { AvatarImage } from "./AvatarImage";

interface BuildIdea {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  castHash: string | null;
  type: string; // 'build-idea' or 'feedback'
  feedbackType: string | null; // For feedback: 'bug', 'feature', or 'feedback'
  userFid: number;
  adminFid?: number; // For backward compatibility
  createdAt: string;
  updatedAt: string;
  user?: {
    fid: number;
    username: string | null;
    displayName: string | null;
    pfpUrl: string | null;
  };
}


export function BuildIdeasManager() {
  const { user } = useNeynarContext();
  const [ideas, setIdeas] = useState<BuildIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    url: "",
  });

  useEffect(() => {
    fetchAllIdeas();
  }, [user?.fid]);

  const fetchAllIdeas = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch all build ideas (including feedback)
      const ideasResponse = await fetch("/api/build-ideas");

      if (!ideasResponse.ok) throw new Error("Failed to fetch build ideas");
      const ideasData = await ideasResponse.json();
      setIdeas(ideasData.ideas || []);
    } catch (err: any) {
      setError(err.message || "Failed to load build ideas");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!user?.fid || !formData.title.trim()) {
      setError("Title is required");
      return;
    }

    try {
      setError(null);
      const response = await fetch("/api/build-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          type: "build-idea",
          adminFid: user.fid, // Backward compatibility
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add build idea");
      }

      setFormData({ title: "", description: "", url: "" });
      setShowAddForm(false);
      fetchAllIdeas();
    } catch (err: any) {
      setError(err.message || "Failed to add build idea");
    }
  };

  const handleEdit = (idea: BuildIdea) => {
    setEditingId(idea.id);
    setFormData({
      title: idea.title,
      description: idea.description || "",
      url: idea.url || "",
    });
    setShowAddForm(false);
  };

  const handleUpdate = async () => {
    if (!user?.fid || !editingId || !formData.title.trim()) {
      setError("Title is required");
      return;
    }

    try {
      setError(null);
      const response = await fetch("/api/build-ideas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          ...formData,
          type: "build-idea",
          adminFid: user.fid, // Backward compatibility
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update build idea");
      }

      setEditingId(null);
      setFormData({ title: "", description: "", url: "" });
      fetchAllIdeas();
    } catch (err: any) {
      setError(err.message || "Failed to update build idea");
    }
  };

  const handleDelete = async (id: string) => {
    if (!user?.fid || !confirm("Are you sure you want to delete this build idea?")) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/build-ideas?id=${id}&adminFid=${user.fid}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete build idea");
      }

      fetchAllIdeas();
    } catch (err: any) {
      setError(err.message || "Failed to delete build idea");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ title: "", description: "", url: "" });
  };

  if (loading) {
    return (
      <div className="text-gray-500 dark:text-gray-400">Loading build ideas...</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Build Ideas & Feedback ({ideas.length} total)
        </h3>
        {!showAddForm && !editingId && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Build Idea
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg">
          {error}
        </div>
      )}

      {showAddForm && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Add New Build Idea
          </h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Enter title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Enter description"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL
              </label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="https://example.com"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ title: "", description: "", url: "" });
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {ideas.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 text-center py-8">
            No build ideas or feedback yet. Submit feedback or click "Add Build Idea" to create one.
          </div>
        ) : (
          <>
            {/* Display all entries from build_ideas table (both build-ideas and feedback) */}
            {ideas
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((idea) => {
                const isFeedback = idea.type === "feedback";
                return (
                  <div
                    key={idea.id}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4"
                  >
                    {editingId === idea.id && !isFeedback ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Title *
                          </label>
                          <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Description
                          </label>
                          <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            rows={3}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            URL
                          </label>
                          <input
                            type="url"
                            value={formData.url}
                            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleUpdate}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            <Save className="w-4 h-4" />
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {isFeedback ? (
                                <>
                                  <MessageSquare className="w-3 h-3 text-green-500" />
                                  <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded">
                                    Feedback
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded">
                                  Build Idea
                                </span>
                              )}
                            </div>
                            <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">
                              {idea.title}
                            </h4>
                            {idea.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {idea.description}
                              </p>
                            )}
                            {isFeedback && idea.castHash && (
                              <Link
                                href={`/cast/${idea.castHash}`}
                                className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View Linked Cast
                              </Link>
                            )}
                            {!isFeedback && idea.url && (
                              <a
                                href={idea.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1 block"
                              >
                                {idea.url}
                              </a>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              {idea.user && (
                                <div className="flex items-center gap-1.5">
                                  <AvatarImage
                                    src={idea.user.pfpUrl}
                                    alt={idea.user.displayName || idea.user.username || `FID ${idea.user.fid}`}
                                    size={20}
                                    className="w-5 h-5 rounded-full"
                                  />
                                  <Link
                                    href={`/profile/${idea.user.fid}`}
                                    className="text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                                  >
                                    {idea.user.displayName || idea.user.username || `FID ${idea.user.fid}`}
                                  </Link>
                                </div>
                              )}
                              <span className="text-xs text-gray-500 dark:text-gray-500">
                                {isFeedback ? "Submitted" : "Created"}: {new Date(idea.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          {!isFeedback && (
                            <div className="flex gap-2 ml-4">
                              <button
                                onClick={() => handleEdit(idea)}
                                className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(idea.id)}
                                className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </>
        )}
      </div>
    </div>
  );
}

