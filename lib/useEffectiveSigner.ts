"use client";

import { useNeynarContext } from "@neynar/react";
import { useEffect, useState } from "react";

/**
 * Hook to get the effective signer_uuid for the current user.
 * 
 * This hook returns the signer_uuid that should be used for write operations.
 * It prioritizes stored signers over new ones from the login flow to prevent
 * creating duplicate signers on each login.
 * 
 * @returns The effective signer_uuid, or null if user is not authenticated
 */
export function useEffectiveSigner(): string | null {
  const { user } = useNeynarContext();
  const [effectiveSignerUuid, setEffectiveSignerUuid] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.fid) {
      setEffectiveSignerUuid(null);
      return;
    }

    // Fetch the effective signer from the backend
    // The /api/user/ensure endpoint returns the signer_uuid that should be used
    const fetchEffectiveSigner = async () => {
      try {
        const response = await fetch("/api/user/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            fid: user.fid,
            ...(user.signer_uuid && { signer_uuid: user.signer_uuid }),
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setEffectiveSignerUuid(data.signer_uuid || user.signer_uuid || null);
        } else {
          // Fallback to user.signer_uuid if API call fails
          setEffectiveSignerUuid(user.signer_uuid || null);
        }
      } catch (error) {
        console.error("Failed to fetch effective signer:", error);
        // Fallback to user.signer_uuid if API call fails
        setEffectiveSignerUuid(user.signer_uuid || null);
      }
    };

    fetchEffectiveSigner();
  }, [user?.fid, user?.signer_uuid]);

  return effectiveSignerUuid;
}

























