"use client";

import { useNavigationTracker } from "@/lib/hooks/useNavigationTracker";
import { BackButton } from "./BackButton";

/**
 * Client component that manages navigation tracking and back button
 * Must be a client component to use hooks
 */
export function NavigationManager() {
  useNavigationTracker();

  return <BackButton />;
}
