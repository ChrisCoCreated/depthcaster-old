"use client";

import { NeynarContextProvider } from "@neynar/react";
import { ReactNode } from "react";

const NEYNAR_CLIENT_ID = process.env.NEXT_PUBLIC_NEYNAR_CLIENT_ID || "";

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!NEYNAR_CLIENT_ID) {
    console.warn("NEXT_PUBLIC_NEYNAR_CLIENT_ID is not set");
  }

  return (
    <NeynarContextProvider
      settings={{
        clientId: NEYNAR_CLIENT_ID,
      }}
    >
      {children}
    </NeynarContextProvider>
  );
}

