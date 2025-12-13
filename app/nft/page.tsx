"use client";

import { useState, useEffect } from "react";
import { ThirdwebProvider, useActiveAccount, useActiveWallet, ConnectButton } from "thirdweb/react";
import { createThirdwebClient } from "thirdweb";
import { base } from "thirdweb/chains";
import { getContract, prepareContractCall, sendTransaction, waitForReceipt } from "thirdweb";

const THIRDWEB_CLIENT_ID = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "";

const client = createThirdwebClient({
  clientId: THIRDWEB_CLIENT_ID,
});

const NFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS || "";
const MINT_PRICE = "1000000000000000"; // 0.001 ETH

interface CollectionStats {
  currentSupply: number;
  maxSupply: number;
  remaining: number;
  isSoldOut: boolean;
  userHasMinted: boolean;
  userMintCount: number;
  price: string;
}

function NFTContent() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    tokenId: number;
    imageUrl: string;
    transactionHash: string;
  } | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  // Fetch collection stats
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [account?.address]);

  const fetchStats = async () => {
    try {
      const params = new URLSearchParams();
      if (account?.address) {
        params.append("userAddress", account.address);
      }
      const response = await fetch(`/api/nft/status?${params}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  const handleMint = async () => {
    if (!account || !wallet) {
      setError("Please connect your wallet");
      return;
    }

    if (!NFT_CONTRACT_ADDRESS) {
      setError("NFT contract not configured");
      return;
    }

    if (stats?.isSoldOut) {
      setError("Collection is sold out");
      return;
    }

    setMinting(true);
    setError(null);
    setSuccess(null);
    setGeneratedImage(null);

    try {
      // Step 1: Generate image and get metadata
      const mintResponse = await fetch("/api/nft/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: account.address,
        }),
      });

      if (!mintResponse.ok) {
        const errorData = await mintResponse.json();
        throw new Error(errorData.error || "Failed to prepare mint");
      }

      const mintData = await mintResponse.json();
      const { tokenId, metadataUrl, imageUrl } = mintData;

      // Show generated image
      setGeneratedImage(imageUrl.replace("ipfs://", "https://ipfs.io/ipfs/"));

      // Step 2: Mint NFT on-chain
      const contract = getContract({
        client,
        chain: base,
        address: NFT_CONTRACT_ADDRESS,
      });

      // Prepare mint transaction
      // Adjust the method signature based on your contract
      const transaction = prepareContractCall({
        contract,
        method: "function mint(address to, string memory uri) payable",
        params: [account.address, metadataUrl],
        value: BigInt(MINT_PRICE),
      });

      // Send transaction
      const result = await sendTransaction({
        transaction,
        account,
      });

      // Wait for receipt
      const receipt = await waitForReceipt(result);

      // Step 3: Confirm mint in database
      await fetch("/api/nft/confirm-mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId,
          transactionHash: receipt.transactionHash,
          userAddress: account.address,
        }),
      });

      setSuccess({
        tokenId,
        imageUrl: imageUrl.replace("ipfs://", "https://ipfs.io/ipfs/"),
        transactionHash: receipt.transactionHash,
      });

      // Refresh stats
      await fetchStats();
    } catch (err: any) {
      console.error("Minting error:", err);
      setError(err.message || "Failed to mint NFT");
    } finally {
      setMinting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Deepsea Diver PFPs
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Generative PFP collection • Dystopic graphic novel style
          </p>
        </div>

        {/* Collection Stats */}
        {stats && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stats.currentSupply}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Minted</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stats.maxSupply}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stats.remaining}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Remaining</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stats.price} ETH
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Price</div>
              </div>
            </div>
          </div>
        )}

        {/* Wallet Connection */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Connect Wallet
            </h2>
            <ConnectButton client={client} />
          </div>
          {account && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Connected: {account.address.slice(0, 6)}...{account.address.slice(-4)}
            </p>
          )}
        </div>

        {/* Mint Section */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Mint Your NFT
          </h2>

          {stats?.isSoldOut ? (
            <div className="text-center py-8">
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
                Collection is sold out!
              </p>
            </div>
          ) : (
            <>
              <button
                onClick={handleMint}
                disabled={!account || minting || loading}
                className="w-full bg-black dark:bg-white text-white dark:text-black py-3 px-6 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {minting ? "Minting..." : `Mint for ${stats?.price || "0.001"} ETH`}
              </button>

              {error && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              {generatedImage && !success && (
                <div className="mt-6">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Your generated NFT:
                  </p>
                  <img
                    src={generatedImage}
                    alt="Generated NFT"
                    className="w-64 h-64 object-cover rounded-lg border border-gray-200 dark:border-gray-800"
                  />
                </div>
              )}

              {success && (
                <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-green-600 dark:text-green-400 font-semibold mb-2">
                    ✅ NFT Minted Successfully!
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Token ID: {success.tokenId}
                  </p>
                  <img
                    src={success.imageUrl}
                    alt={`NFT #${success.tokenId}`}
                    className="w-64 h-64 object-cover rounded-lg border border-gray-200 dark:border-gray-800 mb-4"
                  />
                  <a
                    href={`https://basescan.org/tx/${success.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View on BaseScan →
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NFTPage() {
  return (
    <ThirdwebProvider>
      <NFTContent />
    </ThirdwebProvider>
  );
}

