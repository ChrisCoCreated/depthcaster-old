"use client";

import { useState, useEffect, useRef } from "react";
import { useNeynarContext } from "@neynar/react";
import { AvatarImage } from "./AvatarImage";

interface QualityFeedbackModalProps {
  castHash: string;
  rootCastHash?: string;
  currentQualityScore: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newScore: number, reasoning?: string) => void;
}

interface UserSuggestion {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
}

export function QualityFeedbackModal({
  castHash,
  rootCastHash,
  currentQualityScore,
  isOpen,
  onClose,
  onSuccess,
}: QualityFeedbackModalProps) {
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ newScore: number; reasoning?: string } | null>(null);
  const { user } = useNeynarContext();
  
  // Admin user selection state
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [selectedFeedbackUser, setSelectedFeedbackUser] = useState<UserSuggestion | null>(null);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<UserSuggestion[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Check if user is admin
  useEffect(() => {
    if (!user?.fid || !isOpen) {
      setIsAdmin(false);
      return;
    }

    const checkAdmin = async () => {
      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        const data = await response.json();
        setIsAdmin(data.isAdmin || false);
      } catch (error) {
        console.error("Failed to check admin status:", error);
        setIsAdmin(false);
      }
    };

    checkAdmin();
  }, [user?.fid, isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      setFeedback("");
      setError(null);
      setResult(null);
      setSelectedFeedbackUser(null);
      setUserSearchTerm("");
      setUserSearchResults([]);
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

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
          setUserSearchResults(data.users || []);
          setShowUserDropdown(true);
        }
      } catch (error) {
        console.error("Error searching users:", error);
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

  // Click outside to close dropdown
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

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    if (!user?.fid) {
      setError("Please sign in to provide quality feedback");
      return;
    }

    if (!feedback.trim()) {
      setError("Please provide feedback about why the quality score should change");
      return;
    }

    if (isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch("/api/quality-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          castHash,
          rootCastHash: rootCastHash,
          curatorFid: user.fid,
          feedback: feedback.trim(),
          feedbackUserId: selectedFeedbackUser?.fid || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit quality feedback");
      }

      const data = await response.json();
      const newScore = data.qualityScore;
      const reasoning = data.reasoning;

      // Show result - user can read it and close when ready
      setResult({
        newScore,
        reasoning,
      });
      
      // Call onSuccess with the new data
      if (onSuccess) {
        onSuccess(newScore, reasoning);
      }
      
      // Don't auto-close - let user read the feedback and close manually
    } catch (err: any) {
      setError(err.message || "Failed to submit quality feedback");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeedbackChange = (value: string) => {
    setFeedback(value);
    if (error) {
      setError(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Command+Return (Mac) or Ctrl+Return (Windows/Linux) to submit
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Quality Score Feedback
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Result View */}
        {result ? (
          <div className="p-4">
            <div className="space-y-4">
              {/* Success Message */}
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="font-medium">Quality score updated successfully!</span>
              </div>

              {/* Score Comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Previous Score
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {currentQualityScore}/100
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border-2 border-blue-200 dark:border-blue-800">
                  <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">
                    New Score
                  </div>
                  <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                    {result.newScore}/100
                  </div>
                </div>
              </div>

              {/* Score Change Indicator */}
              {result.newScore !== currentQualityScore && (
                <div className="flex items-center gap-2 text-sm">
                  {result.newScore > currentQualityScore ? (
                    <>
                      <svg
                        className="w-4 h-4 text-green-600 dark:text-green-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 10l7-7m0 0l7 7m-7-7v18"
                        />
                      </svg>
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        +{result.newScore - currentQualityScore} points
                      </span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4 text-red-600 dark:text-red-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 14l-7 7m0 0l-7-7m7 7V3"
                        />
                      </svg>
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {result.newScore - currentQualityScore} points
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* DeepSeek Explanation */}
              {result.reasoning && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    DeepSeek's Analysis:
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {result.reasoning}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setFeedback("");
                    setResult(null);
                    onClose();
                  }}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 rounded-full hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="p-4">
            <div className="space-y-4">
              {/* Current Quality Score */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Current Quality Score
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {currentQualityScore}/100
                </div>
              </div>

              {/* Admin User Selection */}
              {isAdmin && (
                <div>
                  <label
                    htmlFor="feedback-user"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Feedback from user (optional)
                  </label>
                  <div className="relative" ref={userDropdownRef}>
                    {selectedFeedbackUser ? (
                      <div className="flex items-center gap-2 p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-black">
                        <AvatarImage
                          src={selectedFeedbackUser.pfp_url}
                          alt={selectedFeedbackUser.username}
                          size={32}
                          className="w-8 h-8 rounded-full"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {selectedFeedbackUser.display_name || selectedFeedbackUser.username}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            @{selectedFeedbackUser.username}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFeedbackUser(null);
                            setUserSearchTerm("");
                          }}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          aria-label="Remove user"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <input
                          id="feedback-user"
                          type="text"
                          value={userSearchTerm}
                          onChange={(e) => setUserSearchTerm(e.target.value)}
                          onFocus={() => userSearchResults.length > 0 && setShowUserDropdown(true)}
                          placeholder="Search for user (leave empty to submit as yourself)"
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-black text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
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
                    )}
                    
                    {/* User Dropdown */}
                    {showUserDropdown && userSearchResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                        {userSearchResults.map((resultUser) => (
                          <button
                            key={resultUser.fid}
                            type="button"
                            onClick={() => {
                              setSelectedFeedbackUser(resultUser);
                              setUserSearchTerm("");
                              setShowUserDropdown(false);
                            }}
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
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Select a user to attribute feedback to them instead of yourself
                  </p>
                </div>
              )}

              {/* Feedback Textarea */}
              <div>
                <label
                  htmlFor="feedback"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Why should the quality score change?
                </label>
              <textarea
                id="feedback"
                value={feedback}
                onChange={(e) => handleFeedbackChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Explain why you think the quality score should be adjusted. Your feedback will be sent to DeepSeek along with the cast text, embedded casts, and links for re-analysis."
                className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-black text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
                rows={6}
              />
              </div>

              {error && (
                <div className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !feedback.trim()}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 rounded-full hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? "Submitting..." : "Submit Feedback"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
