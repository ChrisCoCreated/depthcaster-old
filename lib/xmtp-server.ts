"use server";

import { Client } from "@xmtp/xmtp-js";
import { db } from "./db";
import { xmtpClients } from "./schema";
import { eq, and } from "drizzle-orm";
import { getAddress, type Address } from "viem";
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

function decryptKeys(encryptedData: string): Uint8Array {
  const [ivHex, encryptedHex] = encryptedData.split(":");
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const iv = Buffer.from(ivHex, "hex");
  const encryptedBuffer = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  return new Uint8Array(decrypted);
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
 * Initialize XMTP client with wallet
 * 
 * IMPORTANT: This will automatically use existing XMTP keys if the wallet is already registered
 * on the XMTP network (from other apps like Converse, Coinbase Wallet, etc.).
 * 
 * When Client.create() is called with a signer, the XMTP SDK automatically:
 * 1. Checks if the wallet address already has an XMTP identity on the network
 * 2. If yes, uses those existing keys (so messages from other apps will be visible)
 * 3. If no, creates new keys and registers the wallet
 * 
 * This means users will see their existing XMTP conversations from other apps!
 */
export async function initializeXmtpClient(
  walletAddress: Address,
  signer: any
): Promise<Client> {
  const address = getAddress(walletAddress);
  
  // Always create client with signer first - this will use existing network keys if available
  // Client.create() with signer automatically detects if wallet already has XMTP identity
  // This is the key to seeing messages from other apps!
  const client = await Client.create(signer, {
    env: XMTP_ENV as any,
  });
  
  // Store keys for future use - XMTP v7 uses different API
  // Try to get keys from the client's keystore
  // These keys may be newly created OR existing keys from other apps
  try {
    // Try to export keys - this will get existing keys if wallet was already registered
    const keys = await (client as any).exportKey?.() || await (client as any).exportKeyBundle?.() || await (client as any).getKeys?.();
    if (keys) {
      await storeClientKeys(address, keys);
    }
  } catch (error) {
    console.warn("Could not export keys from XMTP client:", error);
    // Keys will be stored on next initialization
  }
  
  return client;
}

/**
 * Get or create XMTP client for a user
 * If wallet already has XMTP keys from other apps, they will be automatically used
 */
export async function getOrCreateClient(
  userFid: number,
  walletAddress: Address,
  signer: any
): Promise<Client> {
  const address = getAddress(walletAddress);
  
  // Check if we have stored keys for this user/wallet combination
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
    // Use stored keys for faster initialization
    const keys = decryptKeys(existing[0].keys);
    return await Client.create(null, {
      privateKeyOverride: keys,
      env: XMTP_ENV as any,
    });
  }

  // Initialize client with signer - this will automatically use existing network keys
  // if the wallet is already registered on XMTP (from other apps)
  const client = await initializeXmtpClient(address, signer);
  
  // Store keys in database for this user
  try {
    const keys = await (client as any).exportKey?.() || await (client as any).exportKeyBundle?.();
    if (keys) {
      await storeClientKeysForUser(userFid, address, keys);
    }
  } catch (error) {
    console.warn("Could not export keys from XMTP client:", error);
    // Keys will be stored on next initialization
  }
  
  return client;
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

