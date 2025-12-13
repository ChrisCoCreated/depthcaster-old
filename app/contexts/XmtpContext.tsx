"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Client } from "@xmtp/browser-sdk";
import type { Signer, Identifier } from "@xmtp/browser-sdk";
import { getAddress, type Address } from "viem";

interface XmtpContextType {
  client: Client | null;
  isInitialized: boolean;
  isInitializing: boolean;
  error: string | null;
  initializeClient: (signer: Signer) => Promise<void>;
  address: Address | null;
}

const XmtpContext = createContext<XmtpContextType | undefined>(undefined);

export function XmtpProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<Client | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<Address | null>(null);

  // Check if client is already initialized (from IndexedDB)
  useEffect(() => {
    const checkExistingClient = async () => {
      try {
        // Browser SDK stores keys in IndexedDB automatically
        // We can check if a client exists by trying to create one
        // But we need a signer to do this, so we'll wait for initialization
      } catch (error) {
        // Ignore - client will be initialized when needed
      }
    };
    checkExistingClient();
  }, []);

  const initializeClient = async (signer: Signer) => {
    setIsInitializing(true);
    setError(null);

    try {
      // Get address from signer
      const identifier = await signer.getIdentifier();
      if (identifier.identifierKind !== "Ethereum") {
        throw new Error("Only Ethereum addresses are supported");
      }
      const addr = getAddress(identifier.identifier as Address);
      setAddress(addr);

      // Check if client already exists in IndexedDB
      // Browser SDK automatically handles key storage
      const xmtpEnv = (process.env.NEXT_PUBLIC_XMTP_ENV || "dev") as "dev" | "production";
      
      // Create client - browser SDK will use existing keys from IndexedDB if available
      const newClient = await Client.create(signer, {
        env: xmtpEnv,
      });

      setClient(newClient);
      setIsInitialized(true);
    } catch (err: any) {
      setError(err.message || "Failed to initialize XMTP client");
      setIsInitialized(false);
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <XmtpContext.Provider
      value={{
        client,
        isInitialized,
        isInitializing,
        error,
        initializeClient,
        address,
      }}
    >
      {children}
    </XmtpContext.Provider>
  );
}

export function useXmtp() {
  const context = useContext(XmtpContext);
  if (context === undefined) {
    throw new Error("useXmtp must be used within an XmtpProvider");
  }
  return context;
}

