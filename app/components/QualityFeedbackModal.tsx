"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";

interface QualityFeedbackModalProps {
  castHash: string;
  currentQualityScore: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newScore: number, reasoning?: string) => void;
}

export function QualityFeedbackModal({
  castHash,
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

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      setFeedback("");
      setError(null);
      setResult(null);
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

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
          curatorFid: user.fid,
          feedback: feedback.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit quality feedback");
      }

      const data = await response.json();
      const newScore = data.qualityScore;
      const reasoning = data.reasoning;

      // Show result before closing
      setResult({
        newScore,
        reasoning,
      });
      
      // Call onSuccess with the new data
      if (onSuccess) {
        onSuccess(newScore, reasoning);
      }
      
      // Close after 5 seconds or when user clicks close
      setTimeout(() => {
        setFeedback("");
        setResult(null);
        onClose();
      }, 5000);
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
