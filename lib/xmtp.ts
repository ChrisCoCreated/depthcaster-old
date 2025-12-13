import { Client } from "@xmtp/xmtp-js";
import { db } from "./db";
import { xmtpClients } from "./schema";
import { eq, and } from "drizzle-orm";
import { getAddress, type Address } from "viem";
import type { WalletClient } from "viem";
import crypto from "crypto";

const XMTP_ENV = (process.env.XMTP_ENV as "dev" | "production") || "dev";
const ENCRYPTION_KEY = process.env.XMTP_ENCRYPTION_KEY || "default-key-change-in-production";

/**
 * Simple encryption/decryption for XMTP keys
 * In production, use a proper key management service
 */
function encryptKeys(keys: Uint8Array): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(keys)), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptKeys(encrypted: string): Uint8Array {
  const [ivHex, encryptedHex] = encrypted.split(":");
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return new Uint8Array(decrypted);
}

/**
 * Create a signer from a wallet client for XMTP
 * XMTP expects a signer with getAddress and signMessage methods
 */
export function createXmtpSigner(walletClient: WalletClient) {
  return {
    getAddress: async () => {
      const [address] = await walletClient.getAddresses();
      return address;
    },
    signMessage: async (message: string | Uint8Array) => {
      const [address] = await walletClient.getAddresses();
      const messageStr = typeof message === "string" ? message : new TextDecoder().decode(message);
      return await walletClient.signMessage({
        account: address,
        message: messageStr,
      });
    },
  };
}

/**
 * Initialize XMTP client with wallet
 */
export async function initializeXmtpClient(
  walletAddress: Address,
  signer: any
): Promise<Client> {
  const address = getAddress(walletAddress);
  
  // Check if we have stored keys
  const stored = await loadClientKeys(address);
  
  if (stored) {
    // Create client from stored keys
    const keys = decryptKeys(stored.keys);
    return await Client.create(null, {
      privateKeyOverride: keys,
      env: XMTP_ENV as any,
    });
  } else {
    // Create new client
    const client = await Client.create(signer, {
      env: XMTP_ENV as any,
    });
    
    // Store keys
    const keys = await client.exportKeyBundle();
    await storeClientKeys(address, keys);
    
    return client;
  }
}

/**
 * Get or create XMTP client for a user
 */
export async function getOrCreateClient(
  userFid: number,
  walletAddress: Address,
  signer: any
): Promise<Client> {
  const address = getAddress(walletAddress);
  
  // Check if user already has a client for this wallet
  const existing = await db
    .select()
    .from(xmtpClients)
    .where(
      and(
        eq(xmtpClients.userFid, userFid),
        eq(xmtpClients.walletAddress, address)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Load existing client
    const keys = decryptKeys(existing[0].keys);
    return await Client.create(null, {
      privateKeyOverride: keys,
      env: XMTP_ENV as any,
    });
  }

  // Initialize new client
  const client = await initializeXmtpClient(address, signer);
  
  // Store in database
  const keys = await client.exportKeyBundle();
  await storeClientKeysForUser(userFid, address, keys);
  
  return client;
}

/**
 * Store client keys for a user
 */
async function storeClientKeysForUser(
  userFid: number,
  walletAddress: Address,
  keys: Uint8Array
): Promise<void> {
  const address = getAddress(walletAddress);
  const encrypted = encryptKeys(keys);
  
  await db.insert(xmtpClients).values({
    userFid,
    walletAddress: address,
    keys: encrypted,
  }).onConflictDoUpdate({
    target: [xmtpClients.userFid, xmtpClients.walletAddress],
    set: {
      keys: encrypted,
      updatedAt: new Date(),
    },
  });
}

/**
 * Store client keys (without user association)
 */
export async function storeClientKeys(
  walletAddress: Address,
  keys: Uint8Array
): Promise<void> {
  const address = getAddress(walletAddress);
  const encrypted = encryptKeys(keys);
  
  // This is a simplified version - in practice you'd want to associate with user
  // For now, we'll just store by wallet address
  await db.insert(xmtpClients).values({
    userFid: 0, // Placeholder - should be set when user is known
    walletAddress: address,
    keys: encrypted,
  }).onConflictDoUpdate({
    target: [xmtpClients.userFid, xmtpClients.walletAddress],
    set: {
      keys: encrypted,
      updatedAt: new Date(),
    },
  });
}

/**
 * Load client keys
 */
export async function loadClientKeys(
  walletAddress: Address
): Promise<{ keys: string; userFid: number } | null> {
  const address = getAddress(walletAddress);
  
  const result = await db
    .select()
    .from(xmtpClients)
    .where(eq(xmtpClients.walletAddress, address))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return {
    keys: result[0].keys,
    userFid: Number(result[0].userFid),
  };
}

/**
 * Check if an address can receive messages
 * Note: This requires a client instance, so we'll need to pass one or create a temporary one
 */
export async function canMessage(address: Address, client?: Client): Promise<boolean> {
  try {
    if (!client) {
      // Create a temporary client just for checking
      // This is a read-only operation
      const tempClient = await Client.create(null, {
        env: XMTP_ENV as any,
      });
      return await tempClient.canMessage(address);
    }
    return await client.canMessage(address);
  } catch (error) {
    console.error("Error checking if address can message:", error);
    return false;
  }
}

/**
 * Get client for a user's wallet
 */
export async function getClientForUser(
  userFid: number,
  walletAddress: Address
): Promise<Client | null> {
  const address = getAddress(walletAddress);
  
  const stored = await db
    .select()
    .from(xmtpClients)
    .where(
      and(
        eq(xmtpClients.userFid, userFid),
        eq(xmtpClients.walletAddress, address)
      )
    )
    .limit(1);

  if (stored.length === 0) {
    return null;
  }

  const keys = decryptKeys(stored[0].keys);
  return await Client.create(null, {
    privateKeyOverride: keys,
    env: XMTP_ENV as any,
  });
}

