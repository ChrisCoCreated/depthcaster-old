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
        // XMTP v7: Try accessing keys directly from client properties
        let keys: Uint8Array | null = null;
        
        // Helper function to extract Uint8Array from various key formats
        const extractKeyBytes = (keyData: any, source: string): Uint8Array | null => {
          if (!keyData) {
            console.log(`[${source}] keyData is null/undefined`);
            return null;
          }
          
          console.log(`[${source}] Type: ${typeof keyData}, IsArray: ${Array.isArray(keyData)}, Constructor: ${keyData.constructor?.name}`);
          
          // If already Uint8Array, return it
          if (keyData instanceof Uint8Array) {
            console.log(`[${source}] Found Uint8Array, length: ${keyData.length}`);
            return keyData;
          }
          
          // If it's an array, convert to Uint8Array
          if (Array.isArray(keyData)) {
            console.log(`[${source}] Found array, length: ${keyData.length}`);
            return new Uint8Array(keyData);
          }
          
          // If it's an object, try to extract private key bytes
          if (typeof keyData === 'object') {
            console.log(`[${source}] Found object, keys: ${Object.keys(keyData).join(', ')}`);
            
            // XMTP key bundle structure: has identityKey, preKeys, etc.
            // Try to extract from identityKey first (this is the main private key)
            if (keyData.identityKey) {
              console.log(`[${source}] Found identityKey property`);
              const identityKey = keyData.identityKey;
              
              // Check if identityKey has private key bytes
              if (identityKey.privateKey) {
                console.log(`[${source}] identityKey.privateKey found, type: ${typeof identityKey.privateKey}`);
                if (identityKey.privateKey instanceof Uint8Array) {
                  return identityKey.privateKey;
                }
                if (Array.isArray(identityKey.privateKey)) {
                  return new Uint8Array(identityKey.privateKey);
                }
              }
              if (identityKey.privateKeyBytes) {
                console.log(`[${source}] identityKey.privateKeyBytes found`);
                if (identityKey.privateKeyBytes instanceof Uint8Array) {
                  return identityKey.privateKeyBytes;
                }
                if (Array.isArray(identityKey.privateKeyBytes)) {
                  return new Uint8Array(identityKey.privateKeyBytes);
                }
              }
              if (identityKey.keyBytes) {
                console.log(`[${source}] identityKey.keyBytes found`);
                if (identityKey.keyBytes instanceof Uint8Array) {
                  return identityKey.keyBytes;
                }
                if (Array.isArray(identityKey.keyBytes)) {
                  return new Uint8Array(identityKey.keyBytes);
                }
              }
              // Try to serialize the identityKey if it has a serialize method
              if (typeof identityKey.serialize === 'function') {
                try {
                  const serialized = identityKey.serialize();
                  if (serialized instanceof Uint8Array) {
                    return serialized;
                  }
                  if (Array.isArray(serialized)) {
                    return new Uint8Array(serialized);
                  }
                } catch (e) {
                  console.warn(`[${source}] identityKey.serialize() failed:`, e);
                }
              }
              // If identityKey itself is a Uint8Array or array
              if (identityKey instanceof Uint8Array) {
                return identityKey;
              }
              if (Array.isArray(identityKey)) {
                return new Uint8Array(identityKey);
              }
            }
            
            // Try common property names on the root object
            if (keyData.privateKey) {
              console.log(`[${source}] Found privateKey property, type: ${typeof keyData.privateKey}`);
              if (keyData.privateKey instanceof Uint8Array) {
                return keyData.privateKey;
              }
              if (Array.isArray(keyData.privateKey)) {
                return new Uint8Array(keyData.privateKey);
              }
            }
            if (keyData.privateKeyBytes) {
              console.log(`[${source}] Found privateKeyBytes property`);
              if (keyData.privateKeyBytes instanceof Uint8Array) {
                return keyData.privateKeyBytes;
              }
              if (Array.isArray(keyData.privateKeyBytes)) {
                return new Uint8Array(keyData.privateKeyBytes);
              }
            }
            if (keyData.keyBytes) {
              console.log(`[${source}] Found keyBytes property`);
              if (keyData.keyBytes instanceof Uint8Array) {
                return keyData.keyBytes;
              }
              if (Array.isArray(keyData.keyBytes)) {
                return new Uint8Array(keyData.keyBytes);
              }
            }
            if (keyData.bytes) {
              console.log(`[${source}] Found bytes property`);
              if (keyData.bytes instanceof Uint8Array) {
                return keyData.bytes;
              }
              if (Array.isArray(keyData.bytes)) {
                return new Uint8Array(keyData.bytes);
              }
            }
            // Try serialize method on the root object
            if (typeof keyData.serialize === 'function') {
              try {
                console.log(`[${source}] Trying serialize() method`);
                const serialized = keyData.serialize();
                if (serialized instanceof Uint8Array) {
                  return serialized;
                }
                if (Array.isArray(serialized)) {
                  return new Uint8Array(serialized);
                }
              } catch (e) {
                console.warn(`[${source}] serialize() failed:`, e);
              }
            }
            // If it's an array-like object, try to convert
            if (keyData.length && typeof keyData.length === 'number') {
              console.log(`[${source}] Found array-like object, length: ${keyData.length}`);
              try {
                return new Uint8Array(keyData);
              } catch (e) {
                console.warn(`[${source}] Failed to convert array-like to Uint8Array:`, e);
              }
            }
          }
          
          console.log(`[${source}] Could not extract Uint8Array from keyData`);
          return null;
        };
        
        // Method 1: Try client.keys directly
        if (!keys && (client as any).keys) {
          console.log("Attempting to extract from client.keys...");
          keys = extractKeyBytes((client as any).keys, "client.keys");
          if (keys) {
            console.log("✓ Extracted keys via client.keys");
          }
        } else {
          console.log("client.keys is not available");
        }
        
        // Method 2: Try keystore.v2Keys (prefer v2 over v1)
        if (!keys && (client as any).keystore?.v2Keys) {
          console.log("Attempting to extract from keystore.v2Keys...");
          keys = extractKeyBytes((client as any).keystore.v2Keys, "keystore.v2Keys");
          if (keys) {
            console.log("✓ Extracted keys via keystore.v2Keys");
          }
        } else {
          console.log("keystore.v2Keys is not available");
        }
        
        // Method 3: Try keystore.v1Keys
        if (!keys && (client as any).keystore?.v1Keys) {
          console.log("Attempting to extract from keystore.v1Keys...");
          keys = extractKeyBytes((client as any).keystore.v1Keys, "keystore.v1Keys");
          if (keys) {
            console.log("✓ Extracted keys via keystore.v1Keys");
          }
        } else {
          console.log("keystore.v1Keys is not available");
        }
        
        // Method 4: Try legacyKeys
        if (!keys && (client as any).legacyKeys) {
          console.log("Attempting to extract from legacyKeys...");
          keys = extractKeyBytes((client as any).legacyKeys, "legacyKeys");
          if (keys) {
            console.log("✓ Extracted keys via legacyKeys");
          }
        } else {
          console.log("legacyKeys is not available");
        }
        
        // Method 5: Try keystore exportKeyBundle (fallback)
        if (!keys && (client as any).keystore?.exportKeyBundle) {
          try {
            console.log("Attempting to extract from keystore.exportKeyBundle...");
            const exported = await (client as any).keystore.exportKeyBundle();
            keys = extractKeyBytes(exported, "keystore.exportKeyBundle");
            if (keys) {
              console.log("✓ Extracted keys via keystore.exportKeyBundle");
            }
          } catch (e) {
            console.warn("keystore.exportKeyBundle failed:", e);
          }
        }
        
        // Method 6: Try direct exportKeyBundle (fallback)
        if (!keys && (client as any).exportKeyBundle) {
          try {
            console.log("Attempting to extract from exportKeyBundle...");
            const exported = await (client as any).exportKeyBundle();
            keys = extractKeyBytes(exported, "exportKeyBundle");
            if (keys) {
              console.log("✓ Extracted keys via exportKeyBundle");
            }
          } catch (e) {
            console.warn("exportKeyBundle failed:", e);
          }
        }

        if (keys && keys instanceof Uint8Array && keys.length > 0) {
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
          console.warn("Could not extract keys from XMTP client - keys may not be accessible. Client address:", client.address);
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


