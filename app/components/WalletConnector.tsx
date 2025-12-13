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

  const checkInitialization = async (address: Address) => {
    if (!user?.fid) return;

    try {
      const response = await fetch(
        `/api/xmtp/init?userFid=${user.fid}&walletAddress=${address}`
      );
      if (response.ok) {
        setIsInitialized(true);
        onInitialized?.(address);
      }
    } catch (error) {
      // Not initialized yet
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

      // Request signature for XMTP initialization
      const message = "Initialize XMTP for Depthcaster";
      const signature = await walletClient.signMessage({
        account: address,
        message,
      });

      // Initialize XMTP client
      const response = await fetch("/api/xmtp/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userFid: user.fid,
          walletAddress: address,
          signature,
          message,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to initialize XMTP");
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
      <h3 className="text-lg font-semibold mb-2">Connect Wallet for XMTP</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Connect your Ethereum wallet to enable XMTP messaging.
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


