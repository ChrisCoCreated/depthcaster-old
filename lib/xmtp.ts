import { getAddress, type Address } from "viem";
import type { WalletClient } from "viem";

// Re-export server functions
export {
  getClientForUser,
  getOrCreateClient,
  initializeXmtpClient,
  canMessage,
  loadClientKeys,
  storeClientKeys,
} from "./xmtp-server";

/**
 * Create a signer from a wallet client for XMTP
 * XMTP expects a signer with getAddress and signMessage methods
 * This can be used on the client side
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

