"use client";

import { useEffect, useRef } from "react";
import { useNeynarContext } from "@neynar/react";
import { analytics } from "@/lib/analytics";

export function UserInitializer() {
  const { user } = useNeynarContext();
  const initializedRef = useRef<Set<number>>(new Set());
  const previousUserFidRef = useRef<number | null>(null);
  const lastSignerUuidRef = useRef<Map<number, string>>(new Map());
  const effectiveSignerUuidRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    // Track sign out when user becomes null
    if (previousUserFidRef.current !== null && !user?.fid) {
      analytics.trackAuthSignOut();
      previousUserFidRef.current = null;
      lastSignerUuidRef.current.clear();
      effectiveSignerUuidRef.current.clear();
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

    // Ensure user record exists in database and reconcile signer
    const ensureUser = async () => {
      try {
        console.log("[UserInitializer] ===== STARTING SIGNER RECONCILIATION =====");
        console.log("[UserInitializer] FID:", user.fid);
        console.log("[UserInitializer] New signer from Neynar:", user.signer_uuid);
        
        // Call /api/user/ensure which will:
        // 1. Check for stored signer_uuid
        // 2. Verify stored signer is still valid
        // 3. Use stored signer if valid, otherwise use new one from login
        // 4. Return the effective signer_uuid to use
        console.log("[UserInitializer] Calling /api/user/ensure to reconcile signer...");
        const response = await fetch("/api/user/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            fid: user.fid,
            ...(user.signer_uuid && { signer_uuid: user.signer_uuid }),
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to ensure user: ${response.statusText}`);
        }

        const data = await response.json();
        const effectiveSignerUuid = data.signer_uuid || user.signer_uuid;

        console.log("[UserInitializer] Response from /api/user/ensure:", {
          effectiveSignerUuid,
          newSignerFromNeynar: user.signer_uuid,
        });

        initializedRef.current.add(user.fid);
        
        // Store both the Neynar-provided signer and the effective one
        if (user.signer_uuid) {
          lastSignerUuidRef.current.set(user.fid, user.signer_uuid);
        }
        if (effectiveSignerUuid) {
          effectiveSignerUuidRef.current.set(user.fid, effectiveSignerUuid);
        }

        // Check if stored signer in DB matches the one from user context
        const signersMatch = effectiveSignerUuid === user.signer_uuid;
        
        if (signersMatch) {
          console.log("[UserInitializer] ✅ SIGNERS MATCH");
          console.log("[UserInitializer]   Stored signer in DB:", effectiveSignerUuid);
          console.log("[UserInitializer]   Signer from Neynar context:", user.signer_uuid);
          console.log("[UserInitializer]   ✓ Using the same signer - no new signer created");
        } else {
          console.log("[UserInitializer] ⚠️  SIGNERS DO NOT MATCH");
          console.log("[UserInitializer]   Stored signer in DB:", effectiveSignerUuid);
          console.log("[UserInitializer]   Signer from Neynar context:", user.signer_uuid);
          console.log("[UserInitializer]   ⚠️  New signer was created by Neynar, but we're using stored one from DB");
        }
        
        console.log("[UserInitializer] ===== SIGNER RECONCILIATION COMPLETE =====");
      } catch (error) {
        console.error("[UserInitializer] ❌ Failed to ensure user exists:", error);
      }
    };

    ensureUser();
  }, [user?.fid, user?.signer_uuid]);

  return null;
}










