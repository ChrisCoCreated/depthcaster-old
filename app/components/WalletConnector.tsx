"use client";

import { useState, useEffect } from "react";
import { useNeynarContext } from "@neynar/react";
import { getAddress, type Address } from "viem";
import { createWalletClient, custom } from "viem";
import { mainnet } from "viem/chains";
import { useXmtp } from "../contexts/XmtpContext";

interface WalletConnectorProps {
  onConnected?: (address: Address) => void;
  onInitialized?: (address: Address) => void;
}

export function WalletConnector({ onConnected, onInitialized }: WalletConnectorProps) {
  const { user } = useNeynarContext();
  const { isInitialized, isInitializing, error: xmtpError, initializeClient, address } = useXmtp();
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if wallet is already connected
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      checkConnection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update wallet address when XMTP client is initialized
  useEffect(() => {
    if (address) {
      setWalletAddress(address);
      onConnected?.(address);
      if (isInitialized) {
        onInitialized?.(address);
      }
    }
  }, [address, isInitialized, onConnected, onInitialized]);

  const checkConnection = async () => {
    try {
      const ethereum = (window as { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;
      if (!ethereum) return;
      
      const accounts = await ethereum.request({
        method: "eth_accounts",
      });
      if (accounts.length > 0) {
        const addr = getAddress(accounts[0] as Address);
        setWalletAddress(addr);
        onConnected?.(addr);
      }
    } catch (error) {
      console.error("Error checking wallet connection:", error);
    }
  };

  const connectWallet = async () => {
    const ethereum = (window as { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;
    if (!ethereum) {
      setError("No wallet found. Please install MetaMask or another Ethereum wallet.");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const accounts = await ethereum.request({
        method: "eth_requestAccounts",
      });

      if (accounts.length === 0) {
        throw new Error("No accounts found");
      }

      const addr = getAddress(accounts[0] as Address);
      setWalletAddress(addr);
      onConnected?.(addr);

      // Initialize XMTP if user is logged in
      if (user?.fid) {
        await initializeXmtp(addr);
      }
    } catch (error) {
      const err = error as Error;
      setError(err.message || "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  };

  const initializeXmtp = async (addr: Address) => {
    if (!user?.fid) return;

    try {
      const ethereum = (window as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!ethereum) {
        throw new Error("Wallet not available");
      }

      // Create wallet client for signing
      const walletClient = createWalletClient({
        account: addr,
        chain: mainnet,
        transport: custom(ethereum as any),
      });

      // Create signer for browser SDK (Signer is a type, not a value)
      const signer = {
        type: 'EOA' as const,
        getIdentifier: async () => ({
          identifier: addr,
          identifierKind: 'Ethereum' as const,
        }),
        signMessage: async (message: string): Promise<Uint8Array> => {
          // Browser SDK expects Uint8Array, but viem returns hex string
          const sig = await walletClient.signMessage({
            account: addr,
            message: message,
          });
          // Convert hex string to Uint8Array
          // Remove '0x' prefix and convert to bytes
          const hex = sig.startsWith('0x') ? sig.slice(2) : sig;
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
          }
          return bytes;
        },
      };

      // Initialize XMTP client - browser SDK handles key storage in IndexedDB automatically
      await initializeClient(signer);
    } catch (err) {
      console.error("Error initializing XMTP:", err);
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

      {(error || xmtpError) && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
          {error || xmtpError}
        </div>
      )}

      <div className="flex gap-2">
        {!walletAddress ? (
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="px-4 py-2 bg-accent hover:bg-accent-dark text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
        ) : (
          <button
            onClick={() => initializeXmtp(walletAddress)}
            disabled={isInitializing}
            className="px-4 py-2 bg-accent hover:bg-accent-dark text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isInitializing ? "Initializing..." : "Initialize XMTP"}
          </button>
        )}
      </div>
    </div>
  );
}


