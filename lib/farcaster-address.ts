import { neynarClient } from "./neynar";

/**
 * Get Ethereum address from a Farcaster FID using Neynar API
 * @param fid - Farcaster FID
 * @returns Ethereum address or null if not found
 */
export async function getEthereumAddressFromFid(fid: number): Promise<string | null> {
  try {
    const response = await neynarClient.fetchBulkUsers({ fids: [fid] });
    const user = response.users?.[0];
    
    if (!user) {
      return null;
    }

    // Get the Ethereum address from the user's verifications
    // Neynar returns verifications array with addresses
    const verifications = user.verifications || [];
    
    // Find Ethereum address (starts with 0x and is 42 chars)
    const ethAddress = verifications.find((addr: string) => 
      addr.startsWith("0x") && addr.length === 42
    );

    return ethAddress || null;
  } catch (error) {
    console.error(`Failed to get Ethereum address for FID ${fid}:`, error);
    return null;
  }
}

/**
 * Get XMTP address for a Farcaster user
 * XMTP uses Ethereum addresses, so this resolves FID to address
 * @param fid - Farcaster FID
 * @returns Ethereum address that can be used for XMTP or null
 */
export async function findXmtpAddress(fid: number): Promise<string | null> {
  return await getEthereumAddressFromFid(fid);
}

/**
 * Get multiple Ethereum addresses from FIDs
 * @param fids - Array of Farcaster FIDs
 * @returns Map of FID to Ethereum address
 */
export async function getEthereumAddressesFromFids(
  fids: number[]
): Promise<Map<number, string>> {
  const addressMap = new Map<number, string>();
  
  if (fids.length === 0) {
    return addressMap;
  }

  try {
    // Fetch users in batches (Neynar supports up to 100 at a time)
    const batchSize = 100;
    for (let i = 0; i < fids.length; i += batchSize) {
      const batch = fids.slice(i, i + batchSize);
      const response = await neynarClient.fetchBulkUsers({ fids: batch });
      
      for (const user of response.users || []) {
        const verifications = user.verifications || [];
        const ethAddress = verifications.find((addr: string) => 
          addr.startsWith("0x") && addr.length === 42
        );
        
        if (ethAddress) {
          addressMap.set(user.fid, ethAddress);
        }
      }
    }
  } catch (error) {
    console.error("Failed to get Ethereum addresses from FIDs:", error);
  }

  return addressMap;
}


