"use client";

import { useState, useEffect, useCallback } from "react";
import { use } from "react";
import { useNeynarContext } from "@neynar/react";
import { ConversationView } from "../../components/ConversationView";
import { MarkdownRenderer } from "../../components/MarkdownRenderer";
import { ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { hasCuratorOrAdminRole } from "@/lib/roles-client";

interface PollOption {
  id: string;
  optionText: string;
  markdown?: string | null;
  order: number;
}

interface Poll {
  id: string;
  castHash: string;
  question: string;
  pollType: "ranking" | "choice" | "distribution";
  choices?: string[] | null;
  createdBy: number;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  options: PollOption[];
}

export default function PollPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: slugOrHash } = use(params);
  const { user } = useNeynarContext();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState<string[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [allocations, setAllocations] = useState<Record<string, number>>({});
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
        } else if (data.poll.pollType === "distribution") {
          // Distribution type: initialize allocations object
          if (data.userResponse && typeof data.userResponse === "object") {
            setAllocations(data.userResponse as Record<string, number>);
            setSubmitted(true);
          } else {
            // Initialize with 0 votes for each option
            const initialAllocations: Record<string, number> = {};
            data.poll.options.forEach((opt: PollOption) => {
              initialAllocations[opt.id] = 0;
            });
            setAllocations(initialAllocations);
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

    // Validate distribution-based polls
    if (poll.pollType === "distribution") {
      const total = Object.values(allocations).reduce((sum, val) => sum + val, 0);
      if (total !== 7) {
        setError(`Please allocate exactly 7 votes. Currently allocated: ${total}`);
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
          allocations: poll.pollType === "distribution" ? allocations : undefined,
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

    const isPollClosed = poll.closedAt !== null;
    const isDisabled = checkingCurator || isCurator === false || isPollClosed;
    const showCuratorMessage = !checkingCurator && isCurator === false;

    return (
      <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 ${isDisabled ? "opacity-60" : ""}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {poll.question}
          </h2>
          {isPollClosed && (
            <span className="px-3 py-1 text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
              Closed
            </span>
          )}
        </div>

        {isPollClosed && (
          <div className="mb-4 px-4 py-3 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 text-sm text-gray-700 dark:text-gray-300 rounded-md">
            This poll is closed and no longer accepting responses.
          </div>
        )}

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
            {poll.pollType === "distribution" ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Distribute exactly 7 votes across the options. You can allocate all 7 votes to one option or split them any way you want.
                </p>

                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Votes Remaining:
                    </span>
                    <span className={`text-lg font-bold ${
                      (7 - Object.values(allocations).reduce((sum, val) => sum + val, 0)) === 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-blue-600 dark:text-blue-400"
                    }`}>
                      {7 - Object.values(allocations).reduce((sum, val) => sum + val, 0)} / 7
                    </span>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  {poll.options.map((option) => {
                    const votes = allocations[option.id] || 0;
                    const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);
                    const remaining = 7 - totalAllocated;
                    const maxAllowed = votes + remaining;

                    return (
                      <div
                        key={option.id}
                        className={`p-4 border rounded-lg bg-white dark:bg-gray-800 ${
                          isDisabled ? "opacity-60 cursor-not-allowed" : ""
                        } border-gray-200 dark:border-gray-700`}
                      >
                        <div className="mb-3 text-lg font-bold text-gray-900 dark:text-gray-100">
                          {option.optionText}
                        </div>
                        {option.markdown && (
                          <div className="mb-3 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                            <MarkdownRenderer content={option.markdown} />
                          </div>
                        )}
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (!isDisabled && votes > 0) {
                                  setAllocations((prev) => ({
                                    ...prev,
                                    [option.id]: votes - 1,
                                  }));
                                }
                              }}
                              disabled={isDisabled || votes === 0}
                              className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-bold"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={maxAllowed}
                              value={votes}
                              onChange={(e) => {
                                if (!isDisabled) {
                                  const newValue = Math.max(0, Math.min(maxAllowed, parseInt(e.target.value) || 0));
                                  setAllocations((prev) => ({
                                    ...prev,
                                    [option.id]: newValue,
                                  }));
                                }
                              }}
                              disabled={isDisabled}
                              className="w-16 px-2 py-1 text-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (!isDisabled && votes < maxAllowed) {
                                  setAllocations((prev) => ({
                                    ...prev,
                                    [option.id]: votes + 1,
                                  }));
                                }
                              }}
                              disabled={isDisabled || votes >= maxAllowed}
                              className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-bold"
                            >
                              +
                            </button>
                          </div>
                          <div className="flex-1">
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                              <div
                                className="h-full bg-accent rounded-full transition-all duration-300"
                                style={{ width: `${(votes / 7) * 100}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[3rem] text-right">
                            {votes} vote{votes !== 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : poll.pollType === "choice" ? (
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
                        <div className="mb-3 text-lg font-bold text-gray-900 dark:text-gray-100">
                          {option.optionText}
                        </div>
                        {option.markdown && (
                          <div className="mb-3 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                            <MarkdownRenderer content={option.markdown} />
                          </div>
                        )}
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
                                    ? "bg-accent text-white"
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
                        <div className="flex-1">
                          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                            {option.optionText}
                          </div>
                          {option.markdown && (
                            <div className="mt-1 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                              <MarkdownRenderer content={option.markdown} />
                            </div>
                          )}
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
                className="w-full px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
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

  if (!poll) {
    return (
      <div className="min-h-screen">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-gray-500">Poll not found</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <ConversationView 
            castHash={poll.castHash} 
            viewerFid={user?.fid}
            customContentAfterRoot={renderPollComponent()}
          />
        </div>
      </main>
    </div>
  );
}

