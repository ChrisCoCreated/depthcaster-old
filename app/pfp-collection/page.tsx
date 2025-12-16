"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useActiveAccount, useSendTransaction, useWaitForReceipt } from "thirdweb/react";
import { getContract, createThirdwebClient, readContract } from "thirdweb";
import { base } from "thirdweb/chains";
import { lazyMint } from "thirdweb/extensions/erc721";
import { upload } from "thirdweb/storage";
import dynamic from "next/dynamic";

const WalletClient = dynamic(
  () => import("@/app/components/WalletClient").then((mod) => ({ default: mod.WalletClient })),
  { ssr: false }
);
import { prepareContractCall } from "thirdweb";
import { sendTransaction } from "thirdweb";
import confetti from "canvas-confetti";
import Image from "next/image";

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "",
});

const MINT_PRICE = "0.001";
const MAX_SUPPLY = 1111;

// Get contract address from environment
function getContractAddress(): `0x${string}` | null {
  const address = process.env.NEXT_PUBLIC_PFP_CONTRACT_ADDRESS;
  if (!address) return null;
  return address as `0x${string}`;
}

interface CollectionStats {
  minted: number;
  remaining: number;
  total: number;
}

export default function PfpCollectionPage() {
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [isSettingPrice, setIsSettingPrice] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mintedTokenId, setMintedTokenId] = useState<number | null>(null);
  const [mintedImageUrl, setMintedImageUrl] = useState<string | null>(null);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);
  const [priceTxHash, setPriceTxHash] = useState<string | null>(null);
  const mintProcessedRef = useRef(false);

  const account = useActiveAccount();
  const { mutate: sendTx } = useSendTransaction();

  // Wait for mint transaction confirmation
  const { data: mintReceipt } = useWaitForReceipt({
    client,
    chain: base,
    transactionHash: mintTxHash as `0x${string}`,
  });

  // Wait for price transaction confirmation
  const { data: priceReceipt } = useWaitForReceipt({
    client,
    chain: base,
    transactionHash: priceTxHash as `0x${string}`,
  });

  // Fetch stats on mount
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/pfp/stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  // Handle mint transaction confirmation
  useEffect(() => {
    if (mintReceipt && !mintProcessedRef.current) {
      mintProcessedRef.current = true;
      console.log("Mint transaction confirmed:", mintReceipt);
      setUploadProgress("NFT minted successfully! Setting price...");
      handleSetPrice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintReceipt]);

  // Handle price transaction confirmation
  useEffect(() => {
    if (priceReceipt && !success) {
      console.log("Price transaction confirmed:", priceReceipt);
      setUploadProgress("Price set successfully!");
      setIsSettingPrice(false);
      setIsMinting(false);
      setSuccess(true);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
      // Refresh stats
      fetchStats();
    }
  }, [priceReceipt, success]);

  const handleSetPrice = useCallback(async () => {
    if (!account || mintedTokenId === null) return;
    
    const CONTRACT_ADDRESS = getContractAddress();
    if (!CONTRACT_ADDRESS) {
      setError("Contract address not configured");
      return;
    }

    try {
      setIsSettingPrice(true);
      setUploadProgress("Preparing to set price and supply...");

      const contract = getContract({
        address: CONTRACT_ADDRESS,
        chain: base,
        client,
      });

      const priceInWei = BigInt(Math.floor(parseFloat(MINT_PRICE) * 1e18));
      const maxSupply = BigInt(MAX_SUPPLY);
      const startTimestamp = BigInt(Math.floor(Date.now() / 1000));

      const conditions = [{
        startTimestamp,
        maxClaimableSupply: maxSupply,
        supplyClaimed: BigInt(0),
        quantityLimitPerWallet: BigInt(1), // One per wallet
        merkleRoot: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
        pricePerToken: priceInWei,
        currency: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as `0x${string}`,
        metadata: "ipfs://QmVu98eczZRpSYcF3UKYRDkHsM2RMQR62KUYmk29UDbWTP/0",
      }];

      const transaction = prepareContractCall({
        contract,
        method: "function setClaimConditions(uint256 _tokenId, (uint256 startTimestamp, uint256 maxClaimableSupply, uint256 supplyClaimed, uint256 quantityLimitPerWallet, bytes32 merkleRoot, uint256 pricePerToken, address currency, string metadata)[] _conditions, bool _resetClaimEligibility)",
        params: [BigInt(mintedTokenId), conditions, true],
      });

      setUploadProgress("Sign transaction to set price and supply");
      const result = await sendTransaction({ transaction, account });
      console.log("Price transaction sent:", result.transactionHash);
      setPriceTxHash(result.transactionHash);
      setUploadProgress("Waiting for price transaction confirmation...");
    } catch (error) {
      console.error("Failed to set price:", error);
      setIsSettingPrice(false);
      setIsMinting(false);
      const errorMessage = error instanceof Error ? error.message : "Failed to set price";
      setError(errorMessage);
      setUploadProgress(`NFT minted but price setting failed: ${errorMessage}`);
    }
  }, [account, mintedTokenId]);

  const handleMint = async () => {
    if (!account) {
      setError("Please connect your wallet");
      return;
    }

    const CONTRACT_ADDRESS = getContractAddress();
    if (!CONTRACT_ADDRESS) {
      setError("Contract address not configured. Please set NEXT_PUBLIC_PFP_CONTRACT_ADDRESS");
      return;
    }

    // Check supply
    if (stats && stats.remaining <= 0) {
      setError("Collection is sold out!");
      return;
    }

    setIsGenerating(true);
    setIsMinting(false);
    setIsSettingPrice(false);
    setError(null);
    setSuccess(false);
    setUploadProgress("");
    setMintTxHash(null);
    setPriceTxHash(null);
    mintProcessedRef.current = false;
    setMintedTokenId(null);

    try {
      // Step 1: Generate image
      setUploadProgress("Generating unique PFP image...");
      const generateResponse = await fetch("/api/pfp/generate", {
        method: "POST",
      });

      if (!generateResponse.ok) {
        throw new Error("Failed to generate image");
      }

      const generateData = await generateResponse.json();
      const replicateUrl = generateData.imageUrl;
      const prompt = generateData.prompt;
      const seed = generateData.seed || Date.now().toString();
      console.log("Image generated:", replicateUrl);

      // Step 2: Download image and upload to IPFS
      setUploadProgress("Uploading image to IPFS...");
      const imageResponse = await fetch(replicateUrl);
      if (!imageResponse.ok) {
        throw new Error("Failed to download generated image");
      }

      const imageBlob = await imageResponse.blob();
      const imageFile = new File([imageBlob], `pfp-${seed}.png`, { type: "image/png" });

      const ipfsUri = await upload({
        client,
        files: [imageFile],
      });

      if (!ipfsUri || !ipfsUri.startsWith("ipfs://")) {
        throw new Error("Failed to upload image to IPFS");
      }

      console.log("Image uploaded to IPFS:", ipfsUri);

      // Step 3: Get current token count
      const CONTRACT_ADDRESS = getContractAddress();
      if (!CONTRACT_ADDRESS) {
        throw new Error("Contract address not configured");
      }

      const contract = getContract({
        address: CONTRACT_ADDRESS,
        chain: base,
        client,
      });

      setUploadProgress("Preparing mint transaction...");
      const currentTokenCount = await readContract({
        contract,
        method: "function nextTokenIdToMint() view returns (uint256)",
        params: [],
      });

      const newTokenId = Number(currentTokenCount);
      setMintedTokenId(newTokenId);
      setMintedImageUrl(ipfsUri);

      // Step 4: Create metadata
      const metadata = {
        name: `Deepsea Diver PFP #${newTokenId}`,
        description: `A unique generative PFP from the Deepsea Diver collection. ${prompt}`,
        image: ipfsUri,
      };

      // Step 5: Mint NFT
      setUploadProgress("Sign transaction to mint NFT");
      setIsGenerating(false);
      setIsMinting(true);

      const transaction = lazyMint({
        contract,
        nfts: [metadata],
      });

      sendTx(transaction, {
        onSuccess: async (result) => {
          console.log("Mint transaction sent:", result.transactionHash);
          setMintTxHash(result.transactionHash);
          setUploadProgress("Waiting for mint transaction confirmation...");

          // Store in database
          try {
            await fetch("/api/pfp/mint", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tokenId: newTokenId,
                ownerAddress: account.address,
                imageUrl: ipfsUri,
                metadata,
                transactionHash: result.transactionHash,
                replicateJobId: seed ? seed.toString() : null,
              }),
            });
          } catch (dbError) {
            console.error("Failed to store in database:", dbError);
            // Don't fail the mint if DB storage fails
          }
        },
        onError: (error) => {
          console.error("Mint transaction failed:", error);
          setIsMinting(false);
          const errorMessage = error instanceof Error ? error.message : "Mint failed";
          setError(errorMessage);
          setUploadProgress("");
        },
      });
    } catch (error) {
      console.error("Mint process failed:", error);
      setIsGenerating(false);
      setIsMinting(false);
      const errorMessage = error instanceof Error ? error.message : "Failed to mint NFT";
      setError(errorMessage);
      setUploadProgress("");
    }
  };

  const getIpfsUrl = (ipfsUri: string) => {
    if (!ipfsUri) return "";
    if (ipfsUri.startsWith("ipfs://")) {
      return `https://ipfs.io/ipfs/${ipfsUri.replace("ipfs://", "")}`;
    }
    return ipfsUri;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          Deepsea Diver PFP Collection
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Mint a unique generative profile picture NFT for {MINT_PRICE} ETH
        </p>

        {/* Stats */}
        {stats && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stats.minted}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Minted</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stats.remaining}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Remaining</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {stats.total}
                </div>
                <div className="text-sm text-gray-400">Total</div>
              </div>
            </div>
          </div>
        )}

        {/* Contract Address Check */}
        {!getContractAddress() && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 dark:text-yellow-200">
              ⚠️ Contract address not configured. Please set NEXT_PUBLIC_PFP_CONTRACT_ADDRESS environment variable.
            </p>
          </div>
        )}

        {/* Wallet Connection */}
        {!account && getContractAddress() && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6 mb-6">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Connect your wallet to mint an NFT
            </p>
            <WalletClient />
          </div>
        )}

        {/* Mint Button */}
        {account && !success && getContractAddress() && (
          <div className="mb-6">
            <button
              onClick={handleMint}
              disabled={isGenerating || isMinting || isSettingPrice || (stats?.remaining ?? 0) <= 0}
              className="w-full bg-accent hover:bg-accent-dark text-white font-bold py-4 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating
                ? "Generating Image..."
                : isMinting
                ? "Minting NFT..."
                : isSettingPrice
                ? "Setting Price..."
                : stats && stats.remaining <= 0
                ? "Sold Out"
                : `Mint NFT for ${MINT_PRICE} ETH`}
            </button>
          </div>
        )}

        {/* Progress Message */}
        {uploadProgress && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <p className="text-blue-800 dark:text-blue-200">{uploadProgress}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Success Message */}
        {success && mintedTokenId !== null && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-green-800 dark:text-green-200 mb-2">
              🎉 NFT Minted Successfully!
            </h2>
            <p className="text-green-700 dark:text-green-300 mb-4">
              Your NFT has been minted with Token ID: {mintedTokenId}
            </p>
            {mintedImageUrl && (
              <div className="mt-4">
                <Image
                  src={getIpfsUrl(mintedImageUrl)}
                  alt="Minted NFT"
                  width={400}
                  height={400}
                  className="rounded-lg"
                />
              </div>
            )}
            <button
              onClick={() => {
                setSuccess(false);
                setMintedTokenId(null);
                setMintedImageUrl(null);
                setError(null);
                setUploadProgress("");
                fetchStats();
              }}
              className="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              Mint Another
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

