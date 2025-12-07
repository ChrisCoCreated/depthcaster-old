"use client";

import { NeynarContextProvider } from "@neynar/react";
import { ReactNode } from "react";
import { UserInitializer } from "./UserInitializer";

const NEYNAR_CLIENT_ID = process.env.NEXT_PUBLIC_NEYNAR_CLIENT_ID || "";

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!NEYNAR_CLIENT_ID) {
    console.warn("NEXT_PUBLIC_NEYNAR_CLIENT_ID is not set");
  }

  return (
    <NeynarContextProvider
      settings={{
        clientId: NEYNAR_CLIENT_ID,
        eventsCallbacks: {
          onAuthSuccess: async (data) => {
            // This callback is triggered when user successfully authenticates
            // The UserInitializer component will handle the signer reconciliation flow
            
            // Log the sign-in event
            try {
              await fetch("/api/auth/log-signin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userFid: data.fid,
                  requestData: null, // Request data is handled by Neynar SDK
                  responseData: data,
                  signerUuid: data.signer_uuid,
                  success: true,
                }),
              });
            } catch (error) {
              console.error("Failed to log sign-in event:", error);
            }
          },
          onSignout: () => {
            // Handle signout if needed
          },
        },
      }}
    >
      <UserInitializer />
      {children}
    </NeynarContextProvider>
  );
}

