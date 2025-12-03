"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";

interface CuratorBadgeProps {
  userFid: number;
  viewerFid?: number;
  isCurator: boolean;
  className?: string;
}

export function CuratorBadge({ userFid, viewerFid, isCurator, className = "" }: CuratorBadgeProps) {
  const { user } = useNeynarContext();
  const [isViewerCurator, setIsViewerCurator] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecommended, setIsRecommended] = useState(false);
  const [isCheckingRecommendation, setIsCheckingRecommendation] = useState(true);

  // Check if viewer is curator
  useEffect(() => {
    const checkViewerCuratorStatus = async () => {
      const fidToCheck = viewerFid || user?.fid;
      if (!fidToCheck) {
        setIsViewerCurator(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${fidToCheck}`);
        if (response.ok) {
          const data = await response.json();
          const roles = data.roles || [];
          setIsViewerCurator(roles.includes("curator"));
        }
      } catch (error) {
        console.error("Failed to check curator status:", error);
      }
    };

    checkViewerCuratorStatus();
  }, [viewerFid, user?.fid]);

  // Check if user is already recommended
  useEffect(() => {
    const checkRecommendation = async () => {
      if (!viewerFid && !user?.fid) {
        setIsCheckingRecommendation(false);
        return;
      }

      try {
        const response = await fetch(`/api/curator-recommendations?userFid=${userFid}`);
        if (response.ok) {
          const data = await response.json();
          const recommenderFid = viewerFid || user?.fid;
          setIsRecommended(
            data.recommendations?.some(
              (rec: { recommender_fid: number }) => rec.recommender_fid === recommenderFid
            ) || false
          );
        }
      } catch (error) {
        console.error("Failed to check recommendation:", error);
      } finally {
        setIsCheckingRecommendation(false);
      }
    };

    if (isViewerCurator && !isCurator) {
      checkRecommendation();
    } else {
      setIsCheckingRecommendation(false);
    }
  }, [userFid, viewerFid, user?.fid, isViewerCurator, isCurator]);

  const handleClick = async () => {
    // Only allow clicking if viewer is curator and displayed user is not
    if (!isViewerCurator || isCurator || isLoading || isRecommended) return;

    const recommenderFid = viewerFid || user?.fid;
    if (!recommenderFid) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/curator-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendedUserFid: userFid,
          recommenderFid: recommenderFid,
        }),
      });

      if (response.ok) {
        setIsRecommended(true);
      } else {
        const data = await response.json();
        console.error("Failed to add recommendation:", data.error);
      }
    } catch (error) {
      console.error("Failed to add recommendation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Don't show badge if checking status
  if (isCheckingRecommendation && !isCurator) {
    return null;
  }

  // Active curator badge
  if (isCurator) {
    return (
      <span
        className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 ${className}`}
        title="Curator"
      >
        <svg
          className="w-3 h-3 mr-1"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
        Curator
      </span>
    );
  }

  // Greyed out badge (only show if viewer is curator)
  if (!isViewerCurator) {
    return null;
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading || isRecommended}
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full transition-all ${
        isRecommended
          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 cursor-default"
          : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer"
      } ${isLoading ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
      title={isRecommended ? "Recommended" : "Click to recommend as curator"}
    >
      <svg
        className="w-3 h-3 mr-1"
        fill="currentColor"
        viewBox="0 0 20 20"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      {isLoading ? "..." : isRecommended ? "Recommended" : "Curator"}
    </button>
  );
}
