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

