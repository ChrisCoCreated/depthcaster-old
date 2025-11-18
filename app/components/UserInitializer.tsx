"use client";

import { useEffect, useRef } from "react";
import { useNeynarContext } from "@neynar/react";
import { analytics } from "@/lib/analytics";

export function UserInitializer() {
  const { user } = useNeynarContext();
  const initializedRef = useRef<Set<number>>(new Set());
  const previousUserFidRef = useRef<number | null>(null);
  const lastSignerUuidRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    // Track sign out when user becomes null
    if (previousUserFidRef.current !== null && !user?.fid) {
      analytics.trackAuthSignOut();
      previousUserFidRef.current = null;
      lastSignerUuidRef.current.clear();
      return;
    }

    if (!user?.fid) return;
    
    // Track sign in when user becomes available (new sign in)
    if (previousUserFidRef.current !== user.fid) {
      analytics.trackAuthSignIn(user.fid);
      previousUserFidRef.current = user.fid;
      // Reset initialization tracking for new user
      initializedRef.current.delete(user.fid);
    }
    
    // Check if we need to update (new user or signer_uuid changed)
    const lastSignerUuid = lastSignerUuidRef.current.get(user.fid);
    const needsUpdate = !initializedRef.current.has(user.fid) || 
                       (user.signer_uuid && user.signer_uuid !== lastSignerUuid);

    if (!needsUpdate) return;

    // Ensure user record exists in database
    const ensureUser = async () => {
      try {
        await fetch("/api/user/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            fid: user.fid,
            ...(user.signer_uuid && { signer_uuid: user.signer_uuid }),
          }),
        });
        initializedRef.current.add(user.fid);
        if (user.signer_uuid) {
          lastSignerUuidRef.current.set(user.fid, user.signer_uuid);
        }
      } catch (error) {
        console.error("Failed to ensure user exists:", error);
      }
    };

    ensureUser();
  }, [user?.fid, user?.signer_uuid]);

  return null;
}










