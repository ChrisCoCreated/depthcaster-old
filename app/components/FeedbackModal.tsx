"use client";

import { useState, useEffect, useRef } from "react";
import { useNeynarContext } from "@neynar/react";
import { X, MessageSquare, Send } from "lucide-react";
import { analytics } from "@/lib/analytics";
import { AvatarImage } from "./AvatarImage";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

interface UserSuggestion {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
}

export function FeedbackModal({ isOpen, onClose, isAdmin = false }: FeedbackModalProps) {
  const { user } = useNeynarContext();
  const [formData, setFormData] = useState({
    title: "",
    feedbackType: "feedback",
    description: "",
    castHash: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSuggestion | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<UserSuggestion[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // User search effect
  useEffect(() => {
    if (userSearchTimeoutRef.current) {
      clearTimeout(userSearchTimeoutRef.current);
    }

    if (userSearchTerm.length === 0) {
      setUserSearchResults([]);
      setShowUserDropdown(false);
      return;
    }

    if (userSearchTerm.length < 2) {
      return;
    }

    setIsSearchingUsers(true);
    userSearchTimeoutRef.current = setTimeout(async () => {
      try {
        // Check if search term is a FID (numeric)
        const fidMatch = userSearchTerm.match(/^\d+$/);
        if (fidMatch) {
          const fid = parseInt(fidMatch[0]);
          const response = await fetch(`/api/user/${fid}`);
          if (response.ok) {
            const userData = await response.json();
            setUserSearchResults([{
              fid: userData.fid,
              username: userData.username || "",
              display_name: userData.display_name || "",
              pfp_url: userData.pfp_url,
            }]);
            setShowUserDropdown(true);
          } else {
            setUserSearchResults([]);
          }
        } else {
          // Search by username
          const params = new URLSearchParams({
            q: userSearchTerm,
            limit: "10",
          });
          if (user?.fid) {
            params.append("viewerFid", user.fid.toString());
          }

          const response = await fetch(`/api/user/search?${params}`);
          if (response.ok) {
            const data = await response.json();
            setUserSearchResults((data.users || []).map((u: any) => ({
              fid: u.fid,
              username: u.username || "",
              display_name: u.display_name || "",
              pfp_url: u.pfp_url,
            })));
            setShowUserDropdown(true);
          } else {
            setUserSearchResults([]);
          }
        }
      } catch (error) {
        console.error("Error searching users:", error);
        setUserSearchResults([]);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 300);

    return () => {
      if (userSearchTimeoutRef.current) {
        clearTimeout(userSearchTimeoutRef.current);
      }
    };
  }, [userSearchTerm, user?.fid]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };

    if (showUserDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showUserDropdown]);

  // Manage the "Feedback recorded by" note prefix when user selection changes
  useEffect(() => {
    if (!isAdmin || !user) return;

    const adminName = user.display_name || user.username || `FID ${user.fid}`;
    const recordedByNote = `Feedback recorded by ${adminName}\n\n`;

    if (selectedUser) {
      // Add note if user is selected and note is not already present
      setFormData(prev => {
        if (prev.description.startsWith(recordedByNote)) {
          return prev; // Already has the note
        }
        return {
          ...prev,
          description: recordedByNote + prev.description
        };
      });
    } else {
      // Remove note when user selection is cleared
      setFormData(prev => {
        if (prev.description.startsWith(recordedByNote)) {
          return {
            ...prev,
            description: prev.description.substring(recordedByNote.length)
          };
        }
        return prev;
      });
    }
  }, [selectedUser?.fid, isAdmin, user?.fid, user?.display_name, user?.username]);

  if (!isOpen) return null;

  const handleSelectUser = (selected: UserSuggestion) => {
    setSelectedUser(selected);
    setUserSearchTerm("");
    setShowUserDropdown(false);
  };

  const handleClearSelectedUser = () => {
    setSelectedUser(null);
    setUserSearchTerm("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.fid) {
      setError("Please sign in to submit feedback");
      return;
    }

    if (!formData.title.trim()) {
      setError("Title is required");
      return;
    }

    if (!formData.feedbackType) {
      setError("Please select a feedback type");
      return;
    }

    // For admins, use selected user's FID if provided, otherwise use current user's FID
    const userFidToUse = isAdmin && selectedUser ? selectedUser.fid : user.fid;

    // If admin is submitting on behalf of another user, prepend note to description
    let descriptionToSubmit = formData.description || "";
    if (isAdmin && selectedUser && user) {
      const adminName = user.display_name || user.username || `FID ${user.fid}`;
      const recordedByNote = `Feedback recorded by ${adminName}\n\n`;
      descriptionToSubmit = recordedByNote + descriptionToSubmit;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch("/api/build-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: descriptionToSubmit || null,
          castHash: formData.castHash.trim() || null,
          type: "feedback",
          feedbackType: formData.feedbackType,
          userFid: userFidToUse,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit feedback");
      }

      setSuccess(true);
      
      // Track analytics
      analytics.trackFeedbackSubmit(
        formData.title,
        !!formData.description,
        formData.castHash.trim() || undefined
      );
      
      setFormData({ title: "", feedbackType: "feedback", description: "", castHash: "" });
      setSelectedUser(null);
      setUserSearchTerm("");
      
      // Close modal after 2 seconds
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to submit feedback");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({ title: "", feedbackType: "feedback", description: "", castHash: "" });
      setError(null);
      setSuccess(false);
      setSelectedUser(null);
      setUserSearchTerm("");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-4 border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Submit Feedback
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 rounded-lg text-sm">
              Thank you for your feedback! It has been submitted successfully.
            </div>
          )}

          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                User (Optional - leave empty to submit as yourself)
              </label>
              <div className="relative" ref={userDropdownRef}>
                {selectedUser ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                    <AvatarImage
                      src={selectedUser.pfp_url}
                      alt={selectedUser.username}
                      size={24}
                      className="w-6 h-6 rounded-full"
                    />
                    <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">
                      {selectedUser.display_name || selectedUser.username}
                      {selectedUser.username && (
                        <span className="text-gray-500 dark:text-gray-400 ml-1">
                          @{selectedUser.username}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearSelectedUser}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      aria-label="Clear user"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        onFocus={() => userSearchResults.length > 0 && setShowUserDropdown(true)}
                        placeholder="Search by username or FID..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isSubmitting}
                      />
                      {isSearchingUsers && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    {showUserDropdown && userSearchResults.length > 0 && (
                      <div className="absolute z-[100] w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                        {userSearchResults.map((resultUser) => (
                          <button
                            key={resultUser.fid}
                            type="button"
                            onClick={() => handleSelectUser(resultUser)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                          >
                            <AvatarImage
                              src={resultUser.pfp_url}
                              alt={resultUser.username}
                              size={40}
                              className="w-10 h-10 rounded-full flex-shrink-0"
                            />
                            <div className="flex-1 text-left min-w-0">
                              <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                {resultUser.display_name || resultUser.username}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                @{resultUser.username}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Select a user to submit feedback on their behalf
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Brief title for your feedback"
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Type *
            </label>
            <select
              value={formData.feedbackType}
              onChange={(e) => setFormData({ ...formData, feedbackType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={isSubmitting}
            >
              <option value="bug">Bug</option>
              <option value="feature">Feature</option>
              <option value="feedback">Feedback</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe your feedback, suggestion, or idea..."
              rows={4}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cast Link or Hash (Optional)
            </label>
            <input
              type="text"
              value={formData.castHash}
              onChange={(e) => setFormData({ ...formData, castHash: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paste cast link (e.g., https://warpcast.com/...) or hash (e.g., 0x...)"
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Link this feedback to a specific cast if relevant
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || success}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Feedback
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

