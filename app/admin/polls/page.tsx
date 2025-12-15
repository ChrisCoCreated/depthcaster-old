"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Edit, Trash2, ExternalLink, BarChart3, X, Trophy, Users, TrendingUp } from "lucide-react";
import { extractCastHashFromUrl } from "@/lib/link-converter";
import { AvatarImage } from "@/app/components/AvatarImage";

interface Poll {
  id: string;
  castHash: string;
  slug?: string | null;
  question: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  optionCount: number;
  responseCount: number;
}

export default function AdminPollsPage() {
  const { user } = useNeynarContext();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingPoll, setEditingPoll] = useState<Poll | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingResults, setViewingResults] = useState<Poll | null>(null);
  const [resultsData, setResultsData] = useState<any>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showVoterPfps, setShowVoterPfps] = useState(true);

  // Form state
  const [castHash, setCastHash] = useState("");
  const [slug, setSlug] = useState("");
  const [question, setQuestion] = useState("");
  const [pollType, setPollType] = useState<"ranking" | "choice">("ranking");
  const [choices, setChoices] = useState<string[]>([]);
  const [options, setOptions] = useState<Array<{ text: string; markdown: string }>>([{ text: "", markdown: "" }]);
  const [saving, setSaving] = useState(false);

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
          loadPolls();
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

  const loadPolls = async () => {
    if (!user?.fid) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/polls?userFid=${user.fid}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load polls");
      }

      setPolls(data.polls || []);
    } catch (err: any) {
      setError(err.message || "Failed to load polls");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setCastHash("");
    setSlug("");
    setQuestion("");
    setPollType("ranking");
    setChoices([]);
    setOptions([{ text: "", markdown: "" }]);
    setEditingPoll(null);
    setShowCreateModal(true);
    setError(null);
    setSuccess(null);
  };

  const handleEdit = async (poll: Poll) => {
    setCastHash(poll.castHash);
    setQuestion(poll.question);
    setEditingPoll(poll);
    setShowCreateModal(true);
    setError(null);
    setSuccess(null);
    // Load poll data including type, choices, and slug
    try {
      const response = await fetch(`/api/poll/${poll.castHash}`);
      const data = await response.json();
      if (response.ok && data.poll) {
        setPollType(data.poll.pollType || "ranking");
        setChoices(data.poll.choices || []);
        setSlug(data.poll.slug || "");
        setOptions(data.poll.options.map((opt: any) => ({ text: opt.optionText, markdown: opt.markdown || "" })));
      }
    } catch (err) {
      console.error("Failed to load poll data:", err);
    }
  };

  const loadPollOptions = async (castHash: string) => {
    try {
      const response = await fetch(`/api/poll/${castHash}`);
      const data = await response.json();
      if (response.ok && data.poll) {
        setOptions(data.poll.options.map((opt: any) => ({ text: opt.optionText, markdown: opt.markdown || "" })));
      }
    } catch (err) {
      console.error("Failed to load poll options:", err);
    }
  };

  const handleViewResults = async (poll: Poll) => {
    if (!user?.fid) return;

    setViewingResults(poll);
    setLoadingResults(true);
    setError(null);

    try {
      // Use slug if available, otherwise use castHash
      const identifier = poll.slug || poll.castHash;
      const response = await fetch(`/api/poll/${identifier}/results?userFid=${user.fid}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load results");
      }

      console.log("Poll results data:", data); // Debug log
      setResultsData(data);
    } catch (err: any) {
      console.error("Error loading results:", err);
      setError(err.message || "Failed to load results");
    } finally {
      setLoadingResults(false);
    }
  };

  const handleDelete = async (poll: Poll) => {
    if (!confirm(`Are you sure you want to delete the poll for cast ${poll.castHash}?`)) {
      return;
    }

    if (!user?.fid) return;

    try {
      const response = await fetch(`/api/poll/${poll.castHash}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userFid: user.fid }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete poll");
      }

      setSuccess("Poll deleted successfully");
      loadPolls();
    } catch (err: any) {
      setError(err.message || "Failed to delete poll");
    }
  };

  const handleAddOption = () => {
    setOptions([...options, { text: "", markdown: "" }]);
  };

  const handleAddChoice = () => {
    setChoices([...choices, ""]);
  };

  const handleRemoveChoice = (index: number) => {
    setChoices(choices.filter((_, i) => i !== index));
  };

  const handleChoiceChange = (index: number, value: string) => {
    const newChoices = [...choices];
    newChoices[index] = value;
    setChoices(newChoices);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 1) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionTextChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], text: value };
    setOptions(newOptions);
  };

  const handleOptionMarkdownChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], markdown: value };
    setOptions(newOptions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.fid) return;

    if (!castHash.trim()) {
      setError("Cast hash is required");
      return;
    }

    // Extract cast hash from URL if needed
    let finalCastHash = castHash.trim();
    const extractedHash = extractCastHashFromUrl(finalCastHash);
    if (extractedHash) {
      finalCastHash = extractedHash;
    }

    if (!question.trim()) {
      setError("Question is required");
      return;
    }

    const validOptions = options.filter((opt) => opt.text.trim().length > 0);
    if (validOptions.length < 2) {
      setError("At least 2 options are required");
      return;
    }

    // Validate choices for choice type
    if (pollType === "choice") {
      const validChoices = choices.filter((c) => c.trim().length > 0);
      if (validChoices.length < 2) {
        setError("At least 2 choices are required for choice-type polls");
        return;
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/poll/${finalCastHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          pollType,
          choices: pollType === "choice" ? choices.filter((c) => c.trim().length > 0) : undefined,
          slug: slug.trim() || undefined,
          options: validOptions.map(opt => ({ text: opt.text.trim(), markdown: opt.markdown.trim() || undefined })),
          userFid: user.fid,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save poll");
      }

      setSuccess(editingPoll ? "Poll updated successfully" : "Poll created successfully");
      setShowCreateModal(false);
      loadPolls();
    } catch (err: any) {
      setError(err.message || "Failed to save poll");
    } finally {
      setSaving(false);
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Polls</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Create and manage polls for casts
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Poll
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/40 text-sm text-red-800 dark:text-red-100 rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 px-4 py-3 border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/40 text-sm text-green-800 dark:text-green-100 rounded-md">
          {success}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading polls...</div>
      ) : polls.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No polls yet. Create your first poll!
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cast Hash
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Question
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Options
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Responses
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {polls.map((poll) => (
                <tr key={poll.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <code className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                        {poll.slug || `${poll.castHash.slice(0, 10)}...`}
                      </code>
                      <Link
                        href={`/poll/${poll.slug || poll.castHash}`}
                        target="_blank"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 dark:text-gray-100 max-w-md truncate">
                      {poll.question}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {poll.optionCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {poll.responseCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewResults(poll)}
                        className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
                        title="View Results"
                      >
                        <BarChart3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEdit(poll)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(poll)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
                {editingPoll ? "Edit Poll" : "Create Poll"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Cast Hash or URL
                  </label>
                  <input
                    type="text"
                    value={castHash}
                    onChange={(e) => setCastHash(e.target.value)}
                    placeholder="0x1234... or https://..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    required
                    disabled={!!editingPoll}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {editingPoll ? "Cast hash cannot be changed" : "Enter cast hash or cast URL"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Question
                  </label>
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What is your question?"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Slug (Optional)
                  </label>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      // Auto-format slug: lowercase, replace spaces/special chars with hyphens
                      const formatted = e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-")
                        .replace(/-+/g, "-")
                        .replace(/^-|-$/g, "");
                      setSlug(formatted);
                    }}
                    placeholder="my-poll-slug"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Friendly URL slug. If not set, the cast hash will be used. Only lowercase letters, numbers, and hyphens.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Poll Type
                  </label>
                  <select
                    value={pollType}
                    onChange={(e) => {
                      setPollType(e.target.value as "ranking" | "choice");
                      if (e.target.value === "choice" && choices.length === 0) {
                        setChoices(["love", "like", "meh", "hate"]);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="ranking">Ranking (rank all options)</option>
                    <option value="choice">Choice (rate each option)</option>
                  </select>
                </div>

                {pollType === "choice" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Choices (at least 2 required)
                    </label>
                    <div className="space-y-2">
                      {choices.map((choice, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={choice}
                            onChange={(e) => handleChoiceChange(index, e.target.value)}
                            placeholder={`Choice ${index + 1}`}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            required
                          />
                          {choices.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveChoice(index)}
                              className="px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleAddChoice}
                      className="mt-2 px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                    >
                      + Add Choice
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Options (at least 2 required)
                  </label>
                  <div className="space-y-4">
                    {options.map((option, index) => (
                      <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={option.text}
                            onChange={(e) => handleOptionTextChange(index, e.target.value)}
                            placeholder={`Option ${index + 1}`}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            required
                          />
                          {options.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(index)}
                              className="px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Markdown (optional)
                          </label>
                          <textarea
                            value={option.markdown}
                            onChange={(e) => handleOptionMarkdownChange(index, e.target.value)}
                            placeholder="Optional markdown text to display below this option"
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="mt-2 px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                  >
                    + Add Option
                  </button>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving..." : editingPoll ? "Update Poll" : "Create Poll"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Results Modal */}
      {viewingResults && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Poll Results
                </h2>
                <button
                  onClick={() => {
                    setViewingResults(null);
                    setResultsData(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {loadingResults ? (
                <div className="text-center py-8 text-gray-500">Loading results...</div>
              ) : resultsData ? (
                <div className="space-y-6">
                  {/* Poll Info */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-500 rounded-lg">
                        <BarChart3 className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                          {resultsData.poll.question}
                        </h3>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <Users className="w-4 h-4" />
                            <span className="font-medium">
                              {resultsData.totalResponses} response{resultsData.totalResponses !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {resultsData.poll.pollType === "ranking" && (
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <Trophy className="w-4 h-4" />
                              <span>Ranking Poll</span>
                            </div>
                          )}
                          {resultsData.poll.pollType === "choice" && (
                            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                              <TrendingUp className="w-4 h-4" />
                              <span>Choice Poll</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Collated Results */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {resultsData.poll.pollType === "choice" 
                          ? "Results by Option" 
                          : "Collated Results (Ranked by Average Position)"}
                      </h3>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showVoterPfps}
                          onChange={(e) => setShowVoterPfps(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400 dark:bg-gray-700"
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          Show voter avatars
                        </span>
                      </label>
                    </div>
                    <div className="space-y-3">
                      {resultsData.collatedResults && resultsData.collatedResults.length > 0 ? (
                        resultsData.collatedResults.map((result: any, index: number) => {
                          const maxVotes = resultsData.poll.pollType === "ranking" 
                            ? Math.max(...resultsData.collatedResults.map((r: any) => r.voteCount || 0), 1)
                            : Math.max(...resultsData.collatedResults.map((r: any) => r.totalVotes || 0), 1);
                          const voteCount = resultsData.poll.pollType === "ranking" ? (result.voteCount || 0) : (result.totalVotes || 0);
                          const votePercentage = maxVotes > 0 ? (voteCount / maxVotes) * 100 : 0;

                        return (
                          <div
                            key={result.optionId}
                            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800 transition-all hover:shadow-md"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                {resultsData.poll.pollType === "ranking" && (
                                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold text-white shadow-md">
                                    {index + 1}
                                  </div>
                                )}
                                <span className={`font-semibold text-lg ${result.isDeleted ? 'text-gray-500 dark:text-gray-500 italic' : 'text-gray-900 dark:text-gray-100'}`}>
                                  {result.optionText}
                                </span>
                              </div>
                              {resultsData.poll.pollType === "ranking" && (
                                <div className="text-right">
                                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                    {result.averageRank.toFixed(2)}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    Avg Rank
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Progress Bar */}
                            {voteCount > 0 && (
                              <div className="mb-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    {voteCount} vote{voteCount !== 1 ? "s" : ""} {maxVotes > 1 ? `(${votePercentage.toFixed(0)}%)` : ""}
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full transition-all duration-500 shadow-sm"
                                    style={{ width: `${votePercentage}%` }}
                                  />
                                </div>
                              </div>
                            )}
                            {voteCount === 0 && (
                              <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                                No votes yet
                              </div>
                            )}

                            {/* Voter Profile Pictures */}
                            {showVoterPfps && result.voters && result.voters.length > 0 && (
                              <div className="mt-3 flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Voters:</span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {result.voters.map((voter: any, voterIndex: number) => (
                                    <AvatarImage
                                      key={voterIndex}
                                      src={voter.pfpUrl}
                                      alt={voter.displayName || voter.username || `FID: ${voter.userFid}`}
                                      size={24}
                                      className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}

                            {resultsData.poll.pollType === "ranking" ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Rankings:</span>
                                {result.rankings && result.rankings.length > 0 ? (
                                  result.rankings.map((rank: number, rankIndex: number) => (
                                    <span
                                      key={rankIndex}
                                      className="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                    >
                                      #{rank}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-gray-400 dark:text-gray-500">No rankings yet</span>
                                )}
                              </div>
                            ) : (
                              <div className="mt-3">
                                {/* Positive vs Negative Sentiment */}
                                {result.positiveVotes !== undefined && result.negativeVotes !== undefined && (result.positiveVotes > 0 || result.negativeVotes > 0) && (
                                  <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Sentiment</span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {result.positiveVotes + result.negativeVotes} votes
                                      </span>
                                    </div>
                                    <div className="flex gap-2 mb-2">
                                      <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-xs font-semibold text-green-700 dark:text-green-300">Positive</span>
                                          <span className="text-xs font-bold text-green-700 dark:text-green-300">
                                            {result.positivePercentage.toFixed(1)}%
                                          </span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
                                          <div
                                            className="h-full bg-green-500 rounded-full transition-all"
                                            style={{ width: `${result.positivePercentage}%` }}
                                          />
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                          {result.positiveVotes} vote{result.positiveVotes !== 1 ? 's' : ''} (like + love)
                                        </div>
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-xs font-semibold text-red-700 dark:text-red-300">Negative</span>
                                          <span className="text-xs font-bold text-red-700 dark:text-red-300">
                                            {result.negativePercentage.toFixed(1)}%
                                          </span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
                                          <div
                                            className="h-full bg-red-500 rounded-full transition-all"
                                            style={{ width: `${result.negativePercentage}%` }}
                                          />
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                          {result.negativeVotes} vote{result.negativeVotes !== 1 ? 's' : ''} (meh + hate)
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                
                                {result.choiceCounts && Object.keys(result.choiceCounts).length > 0 ? (
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {Object.entries(result.choiceCounts || {})
                                      .sort(([choiceA], [choiceB]) => {
                                        // Order: Love, Like, Meh, Hate
                                        const order: Record<string, number> = {
                                          love: 0,
                                          like: 1,
                                          meh: 2,
                                          hate: 3,
                                        };
                                        const orderA = order[choiceA.toLowerCase()] ?? 999;
                                        const orderB = order[choiceB.toLowerCase()] ?? 999;
                                        return orderA - orderB;
                                      })
                                      .map(([choice, count]: [string, any]) => {
                                    const total = result.totalVotes || 1;
                                    const percentage = (count / total) * 100;
                                    const choiceColors: Record<string, any> = {
                                      love: { bg: "bg-pink-500", text: "text-pink-700", textDark: "text-pink-300", bgLight: "bg-pink-100", bgDark: "bg-pink-900/40" },
                                      like: { bg: "bg-green-500", text: "text-green-700", textDark: "text-green-300", bgLight: "bg-green-100", bgDark: "bg-green-900/40" },
                                      meh: { bg: "bg-yellow-500", text: "text-yellow-700", textDark: "text-yellow-300", bgLight: "bg-yellow-100", bgDark: "bg-yellow-900/40" },
                                      hate: { bg: "bg-red-500", text: "text-red-700", textDark: "text-red-300", bgLight: "bg-red-100", bgDark: "bg-red-900/40" },
                                    };
                                    const choiceColor = choiceColors[choice.toLowerCase()] || { bg: "bg-blue-500", text: "text-blue-700", textDark: "text-blue-300", bgLight: "bg-blue-100", bgDark: "bg-blue-900/40" };
                                    
                                    return (
                                      <div
                                        key={choice}
                                        className={`border ${choiceColor.bgLight} dark:${choiceColor.bgDark} rounded-lg p-2`}
                                      >
                                        <div className="flex items-center justify-between mb-1">
                                          <span className={`text-xs font-semibold capitalize ${choiceColor.text} dark:${choiceColor.textDark}`}>
                                            {choice}
                                          </span>
                                          <span className={`text-xs font-bold ${choiceColor.text} dark:${choiceColor.textDark}`}>
                                            {count}
                                          </span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                                          <div
                                            className={`h-full ${choiceColor.bg} rounded-full transition-all duration-300`}
                                            style={{ width: `${percentage}%` }}
                                          />
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                          {percentage.toFixed(0)}%
                                        </div>
                                      </div>
                                    );
                                  })}
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-400 dark:text-gray-500">No choices recorded yet</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                      ) : (
                        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                          No results available
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Individual Responses */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Individual Responses
                      </h3>
                    </div>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {resultsData.individualResponses.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                          No responses yet
                        </p>
                      ) : (
                        resultsData.individualResponses.map((response: any) => (
                          <div
                            key={response.id}
                            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-900"
                          >
                            <div className="flex items-center gap-3 mb-3">
                              <AvatarImage
                                src={response.pfpUrl}
                                alt={response.displayName || response.username || `FID: ${response.userFid}`}
                                size={32}
                                className="w-8 h-8 rounded-full"
                              />
                              <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                  {response.displayName || response.username || `FID: ${response.userFid}`}
                                </div>
                                {response.username && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    @{response.username}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="space-y-2">
                              {resultsData.poll.pollType === "ranking" ? (
                                response.rankings && response.rankings.length > 0 ? (
                                  response.rankings.map((ranked: any, rankIndex: number) => {
                                    return (
                                      <div
                                        key={ranked.optionId}
                                        className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                                      >
                                        <span className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white shadow-sm">
                                          {ranked.rank}
                                        </span>
                                        <span className="flex-1 font-medium text-gray-900 dark:text-gray-100">
                                          {ranked.optionText}
                                        </span>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="text-sm text-gray-400 dark:text-gray-500">No rankings submitted</div>
                                )
                              ) : (
                                response.choices && response.choices.length > 0 ? (
                                  response.choices
                                    .filter((optionChoice: any) => optionChoice.choice && optionChoice.choice.trim() !== "")
                                    .sort((a: any, b: any) => {
                                      // Order: Love, Like, Meh, Hate
                                      const order: Record<string, number> = {
                                        love: 0,
                                        like: 1,
                                        meh: 2,
                                        hate: 3,
                                      };
                                      const orderA = order[a.choice.toLowerCase()] ?? 999;
                                      const orderB = order[b.choice.toLowerCase()] ?? 999;
                                      return orderA - orderB;
                                    })
                                    .map((optionChoice: any) => {
                                    const choiceColors: Record<string, any> = {
                                      love: { bg: "bg-pink-500", text: "text-pink-700", textDark: "text-pink-300", bgLight: "bg-pink-100", bgDark: "bg-pink-900/40" },
                                      like: { bg: "bg-green-500", text: "text-green-700", textDark: "text-green-300", bgLight: "bg-green-100", bgDark: "bg-green-900/40" },
                                      meh: { bg: "bg-yellow-500", text: "text-yellow-700", textDark: "text-yellow-300", bgLight: "bg-yellow-100", bgDark: "bg-yellow-900/40" },
                                      hate: { bg: "bg-red-500", text: "text-red-700", textDark: "text-red-300", bgLight: "bg-red-100", bgDark: "bg-red-900/40" },
                                    };
                                    const choiceColor = choiceColors[optionChoice.choice.toLowerCase()] || { bg: "bg-blue-500", text: "text-blue-700", textDark: "text-blue-300", bgLight: "bg-blue-100", bgDark: "bg-blue-900/40" };
                                    
                                    return (
                                      <div
                                        key={optionChoice.optionId}
                                        className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                                      >
                                        <span className={`flex-1 font-medium ${optionChoice.isDeleted ? 'text-gray-500 dark:text-gray-500 italic' : 'text-gray-900 dark:text-gray-100'}`}>
                                          {optionChoice.optionText}
                                        </span>
                                        <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${choiceColor.bgLight} dark:${choiceColor.bgDark} ${choiceColor.text} dark:${choiceColor.textDark} border-2 ${choiceColor.bg} border-opacity-30`}>
                                          {optionChoice.choice}
                                        </span>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="text-sm text-gray-400 dark:text-gray-500">No choices submitted</div>
                                )
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">No results data</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

