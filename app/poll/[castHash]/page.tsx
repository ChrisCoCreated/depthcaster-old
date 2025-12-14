"use client";

import { useState, useEffect, useCallback } from "react";
import { use } from "react";
import { useNeynarContext } from "@neynar/react";
import { ConversationView } from "../../components/ConversationView";
import { ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { hasCuratorOrAdminRole } from "@/lib/roles-client";

interface PollOption {
  id: string;
  optionText: string;
  order: number;
}

interface Poll {
  id: string;
  castHash: string;
  question: string;
  pollType: "ranking" | "choice";
  choices?: string[] | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  options: PollOption[];
}

export default function PollPage({
  params,
}: {
  params: Promise<{ castHash: string }>;
}) {
  const { castHash: slugOrHash } = use(params);
  const { user } = useNeynarContext();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isCurator, setIsCurator] = useState<boolean | null>(null);
  const [checkingCurator, setCheckingCurator] = useState(false);

  const fetchPoll = useCallback(async () => {
    try {
      setLoading(true);
      const url = user?.fid 
        ? `/api/poll/${slugOrHash}?userFid=${user.fid}`
        : `/api/poll/${slugOrHash}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok && data.poll) {
        setPoll(data.poll);
        // Initialize based on poll type
        if (data.poll.pollType === "choice") {
          // Choice type: initialize choices object
          if (data.userResponse && typeof data.userResponse === "object") {
            setChoices(data.userResponse as Record<string, string>);
            setSubmitted(true);
          } else {
            // Initialize with empty choices for each option
            const initialChoices: Record<string, string> = {};
            data.poll.options.forEach((opt: PollOption) => {
              initialChoices[opt.id] = "";
            });
            setChoices(initialChoices);
          }
        } else {
          // Ranking type: initialize rankings array
          if (data.userResponse && Array.isArray(data.userResponse)) {
            setRankings(data.userResponse);
            setSubmitted(true);
          } else {
            setRankings(data.poll.options.map((opt: PollOption) => opt.id));
          }
        }
      } else {
        setPoll(null);
      }
    } catch (err) {
      console.error("Failed to fetch poll:", err);
      setError("Failed to load poll");
    } finally {
      setLoading(false);
    }
  }, [slugOrHash, user?.fid]);

  useEffect(() => {
    fetchPoll();
  }, [fetchPoll]);

  useEffect(() => {
    const checkCuratorStatus = async () => {
      if (!user?.fid) {
        setIsCurator(false);
        return;
      }

      try {
        setCheckingCurator(true);
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        if (response.ok) {
          const data = await response.json();
          const roles = data.roles || [];
          setIsCurator(hasCuratorOrAdminRole(roles));
        } else {
          setIsCurator(false);
        }
      } catch (error) {
        console.error("Failed to check curator status:", error);
        setIsCurator(false);
      } finally {
        setCheckingCurator(false);
      }
    };

    checkCuratorStatus();
  }, [user?.fid]);

  const moveOption = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    const newRankings = [...rankings];
    const [moved] = newRankings.splice(fromIndex, 1);
    newRankings.splice(toIndex, 0, moved);
    setRankings(newRankings);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    moveOption(index, index - 1);
  };

  const moveDown = (index: number) => {
    if (index === rankings.length - 1) return;
    moveOption(index, index + 1);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      moveOption(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSubmit = async () => {
    if (!user || !poll) return;

    // Validate choice-based polls
    if (poll.pollType === "choice") {
      const allOptionsHaveChoice = poll.options.every((opt) => choices[opt.id] && choices[opt.id].trim() !== "");
      if (!allOptionsHaveChoice) {
        setError("Please select a choice for all options");
        return;
      }
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/poll/${slugOrHash}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rankings: poll.pollType === "ranking" ? rankings : undefined,
          choices: poll.pollType === "choice" ? choices : undefined,
          userFid: user.fid,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSubmitted(true);
      } else {
        setError(data.error || "Failed to submit poll");
      }
    } catch (err) {
      console.error("Failed to submit poll:", err);
      setError("Failed to submit poll");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChoiceChange = (optionId: string, choice: string) => {
    setChoices((prev) => ({
      ...prev,
      [optionId]: choice,
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-gray-500">Loading poll...</div>
        </main>
      </div>
    );
  }

  const renderPollComponent = () => {
    if (!poll) {
      return (
        <div className="px-4 py-3 border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 rounded-md text-sm text-gray-700 dark:text-gray-300">
          No poll has been set up for this cast yet.
        </div>
      );
    }

    const isDisabled = checkingCurator || isCurator === false;
    const showCuratorMessage = !checkingCurator && isCurator === false;

    return (
      <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 ${isDisabled ? "opacity-60" : ""}`}>
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          {poll.question}
        </h2>

        {showCuratorMessage && (
          <div className="mb-4 px-4 py-3 border border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/40 text-sm text-yellow-800 dark:text-yellow-100 rounded-md">
            Polls are only available to users with curator role. Please contact an admin to request curator access.
          </div>
        )}

        {submitted ? (
          <div className="px-4 py-3 border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/40 text-sm text-green-800 dark:text-green-100 rounded-md">
            Your response has been submitted successfully!
          </div>
        ) : (
          <>
            {poll.pollType === "choice" ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Select a choice for each option.
                </p>

                <div className="space-y-4 mb-6">
                  {poll.options.map((option) => {
                    const pollChoices = poll.choices || [];
                    const selectedChoice = choices[option.id] || "";

                    return (
                      <div
                        key={option.id}
                        className={`p-4 border rounded-lg bg-white dark:bg-gray-800 ${
                          isDisabled ? "opacity-60 cursor-not-allowed" : ""
                        } border-gray-200 dark:border-gray-700`}
                      >
                        <div className="mb-3 font-medium text-gray-900 dark:text-gray-100">
                          {option.optionText}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {pollChoices.map((choice) => (
                            <button
                              key={choice}
                              type="button"
                              onClick={() => !isDisabled && handleChoiceChange(option.id, choice)}
                              disabled={isDisabled}
                              className={`
                                px-4 py-2 rounded-lg text-sm font-medium transition-colors
                                ${
                                  selectedChoice === choice
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
                                }
                                ${isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
                              `}
                            >
                              {choice}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Rank the options from best to worst by dragging them or using the arrow buttons.
                </p>

                <div className="space-y-2 mb-6">
                  {rankings.map((optionId, index) => {
                    const option = poll.options.find((opt) => opt.id === optionId);
                    if (!option) return null;

                    return (
                      <div
                        key={option.id}
                        draggable={!isDisabled}
                        onDragStart={!isDisabled ? () => handleDragStart(index) : undefined}
                        onDragOver={!isDisabled ? (e) => handleDragOver(e, index) : undefined}
                        onDragLeave={!isDisabled ? handleDragLeave : undefined}
                        onDrop={!isDisabled ? (e) => handleDrop(e, index) : undefined}
                        className={`
                          flex items-center gap-3 p-4 border rounded-lg
                          ${draggedIndex === index ? "opacity-50" : ""}
                          ${dragOverIndex === index ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 dark:border-gray-700"}
                          bg-white dark:bg-gray-800
                          ${isDisabled ? "cursor-not-allowed" : "cursor-move"}
                          transition-colors
                        `}
                      >
                        <div className="shrink-0 text-gray-400 dark:text-gray-500">
                          <GripVertical className="w-5 h-5" />
                        </div>
                        <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-sm font-semibold text-blue-700 dark:text-blue-300">
                          {index + 1}
                        </div>
                        <div className="flex-1 text-gray-900 dark:text-gray-100">
                          {option.optionText}
                        </div>
                        <div className="shrink-0 flex gap-1">
                          <button
                            type="button"
                            onClick={() => moveUp(index)}
                            disabled={isDisabled || index === 0}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Move up"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveDown(index)}
                            disabled={isDisabled || index === rankings.length - 1}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Move down"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {error && (
              <div className="mb-4 px-4 py-3 border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/40 text-sm text-red-800 dark:text-red-100 rounded-md">
                {error}
              </div>
            )}

            {user ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isDisabled || submitting}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {submitting ? "Submitting..." : "Submit Response"}
              </button>
            ) : (
              <div className="px-4 py-3 border border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/40 text-sm text-yellow-800 dark:text-yellow-100 rounded-md">
                Please sign in to submit your response.
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <ConversationView 
            castHash={castHash} 
            viewerFid={user?.fid}
            customContentAfterRoot={renderPollComponent()}
          />
        </div>
      </main>
    </div>
  );
}

