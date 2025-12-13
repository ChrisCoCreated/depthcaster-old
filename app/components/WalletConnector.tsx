"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { getAddress, type Address } from "viem";
import { createWalletClient, custom, http } from "viem";
import { mainnet } from "viem/chains";

interface WalletConnectorProps {
  onConnected?: (address: Address) => void;
  onInitialized?: (address: Address) => void;
}

export function WalletConnector({ onConnected, onInitialized }: WalletConnectorProps) {
  const { user } = useNeynarContext();
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Check if wallet is already connected
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      checkConnection();
    }
  }, []);

  // Re-check initialization when user changes
  useEffect(() => {
    if (walletAddress && user?.fid) {
      checkInitialization(walletAddress);
    }
  }, [user?.fid, walletAddress]);

  const checkConnection = async () => {
    try {
      const accounts = await (window as any).ethereum.request({
        method: "eth_accounts",
      });
      if (accounts.length > 0) {
        const address = getAddress(accounts[0]);
        setWalletAddress(address);
        checkInitialization(address);
      }
    } catch (error) {
      console.error("Error checking wallet connection:", error);
    }
  };

  const checkInitialization = async (address: Address): Promise<boolean> => {
    if (!user?.fid) {
      setIsInitialized(false);
      return false;
    }

    try {
      const response = await fetch(
        `/api/xmtp/init?userFid=${user.fid}&walletAddress=${address}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.initialized || data.success) {
          setIsInitialized(true);
          onInitialized?.(address);
          return true;
        } else {
          setIsInitialized(false);
          return false;
        }
      } else {
        setIsInitialized(false);
        return false;
      }
    } catch (error) {
      setIsInitialized(false);
      return false;
    }
  };

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      setError("No wallet found. Please install MetaMask or another Ethereum wallet.");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const accounts = await (window as any).ethereum.request({
        method: "eth_requestAccounts",
      });

      if (accounts.length === 0) {
        throw new Error("No accounts found");
      }

      const address = getAddress(accounts[0]);
      setWalletAddress(address);
      onConnected?.(address);

      // Initialize XMTP if user is logged in
      if (user?.fid) {
        await initializeXmtp(address);
      }
    } catch (error: any) {
      setError(error.message || "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  };

  const initializeXmtp = async (address: Address) => {
    if (!user?.fid) return;

    setIsInitializing(true);
    setError(null);

    try {
      // Create wallet client for signing
      const walletClient = createWalletClient({
        account: address,
        chain: mainnet,
        transport: custom((window as any).ethereum),
      });

      // Create signer for XMTP
      const signer = {
        getAddress: async () => address,
        signMessage: async (message: string | Uint8Array) => {
          const messageStr = typeof message === "string" ? message : new TextDecoder().decode(message);
          return await walletClient.signMessage({
            account: address,
            message: messageStr,
          });
        },
      };

      // Initialize XMTP client directly - this will automatically use existing keys
      // if the wallet is already registered on XMTP (from other apps like Converse, Coinbase Wallet, etc.)
      // Client.create() with a signer automatically detects and uses existing XMTP identity
      const { Client } = await import("@xmtp/xmtp-js");
      const xmtpEnv = (process.env.NEXT_PUBLIC_XMTP_ENV || process.env.XMTP_ENV || "dev") as "dev" | "production";
      const client = await Client.create(signer, {
        env: xmtpEnv,
      });

      // Export and store keys on server
      // These keys may be newly created OR existing keys from other apps
      try {
        // XMTP v7: Try multiple methods to export keys
        let keys: Uint8Array | null = null;
        
        // Debug: Log available methods on client
        console.log("XMTP Client object keys:", Object.keys(client));
        console.log("XMTP Client keystore:", (client as any).keystore ? Object.keys((client as any).keystore) : "no keystore");
        
        // Method 1: Try keystore exportKeyBundle
        if ((client as any).keystore?.exportKeyBundle) {
          try {
            keys = await (client as any).keystore.exportKeyBundle();
            console.log("Exported keys via keystore.exportKeyBundle");
          } catch (e) {
            console.warn("keystore.exportKeyBundle failed:", e);
          }
        }
        // Method 2: Try direct exportKeyBundle
        if (!keys && (client as any).exportKeyBundle) {
          try {
            keys = await (client as any).exportKeyBundle();
            console.log("Exported keys via exportKeyBundle");
          } catch (e) {
            console.warn("exportKeyBundle failed:", e);
          }
        }
        // Method 3: Try exportKey
        if (!keys && (client as any).exportKey) {
          try {
            keys = await (client as any).exportKey();
            console.log("Exported keys via exportKey");
          } catch (e) {
            console.warn("exportKey failed:", e);
          }
        }
        // Method 4: Try accessing privateKey directly
        if (!keys && (client as any).privateKey) {
          keys = (client as any).privateKey;
          console.log("Got keys via privateKey");
        }
        // Method 5: Try keystore.getPrivateKey
        if (!keys && (client as any).keystore?.getPrivateKey) {
          try {
            keys = await (client as any).keystore.getPrivateKey();
            console.log("Exported keys via keystore.getPrivateKey");
          } catch (e) {
            console.warn("keystore.getPrivateKey failed:", e);
          }
        }

        if (keys && keys instanceof Uint8Array) {
          const keysArray = Array.from(keys);
          const response = await fetch("/api/xmtp/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userFid: user.fid,
              walletAddress: address,
              keys: keysArray,
            }),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to store XMTP keys");
          }
          console.log("XMTP keys stored successfully");
        } else {
          console.warn("Could not export keys from XMTP client - keys may not be accessible. Client address:", client.address);
          // Still mark as initialized since the client works, but keys won't be persisted
          // This means the user will need to re-initialize on each session
        }
      } catch (error: any) {
        console.error("Error storing XMTP keys:", error);
        // Continue anyway - the client is initialized and can be used
        // Keys will need to be re-exported on next initialization
      }

      setIsInitialized(true);
      onInitialized?.(address);
    } catch (error: any) {
      setError(error.message || "Failed to initialize XMTP");
    } finally {
      setIsInitializing(false);
    }
  };

  if (!user) {
    return (
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          Please sign in with Farcaster to use XMTP chat.
        </p>
      </div>
    );
  }

  if (isInitialized && walletAddress) {
    return (
      <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <p className="text-sm text-green-800 dark:text-green-200">
          XMTP initialized for {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
      <h3 className="text-lg font-semibold mb-2">
        {walletAddress ? "Initialize XMTP" : "Connect Wallet for XMTP"}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {walletAddress
          ? `Wallet connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}. Initialize XMTP to start messaging.`
          : "Connect your Ethereum wallet to enable XMTP messaging."}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {!walletAddress ? (
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
        ) : (
          <button
            onClick={() => initializeXmtp(walletAddress)}
            disabled={isInitializing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isInitializing ? "Initializing..." : "Initialize XMTP"}
          </button>
        )}
      </div>
    </div>
  );
}


