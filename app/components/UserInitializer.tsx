"use client";

import { useEffect, useRef } from "react";
import { useNeynarContext } from "@neynar/react";

export function UserInitializer() {
  const { user } = useNeynarContext();
  const initializedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!user?.fid) return;
    
    // Skip if we've already initialized this user in this session
    if (initializedRef.current.has(user.fid)) return;

    // Ensure user record exists in database
    const ensureUser = async () => {
      try {
        await fetch("/api/user/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fid: user.fid }),
        });
        initializedRef.current.add(user.fid);
      } catch (error) {
        console.error("Failed to ensure user exists:", error);
      }
    };

    ensureUser();
  }, [user?.fid]);

  return null;
}





