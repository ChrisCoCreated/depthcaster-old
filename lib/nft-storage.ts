/**
 * IPFS Storage utilities using thirdweb Storage
 */

const THIRDWEB_STORAGE_URL = "https://storage.thirdweb.com";

/**
 * Upload a file to IPFS via thirdweb Storage
 */
export async function uploadToIPFS(
  file: File | Blob | Buffer,
  fileName?: string
): Promise<string> {
  const formData = new FormData();
  
  // Convert Buffer to Blob if needed
  let blob: Blob;
  if (Buffer.isBuffer(file)) {
    blob = new Blob([file]);
  } else if (file instanceof File) {
    blob = file;
  } else {
    blob = file;
  }
  
  formData.append("file", blob, fileName || "file");
  
  const response = await fetch(`${THIRDWEB_STORAGE_URL}/ipfs/upload`, {
    method: "POST",
    body: formData,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload to IPFS: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  
  // thirdweb returns { ipfsHash: "..." } or { IpfsHash: "..." }
  const ipfsHash = data.ipfsHash || data.IpfsHash;
  if (!ipfsHash) {
    throw new Error("Invalid response from IPFS upload");
  }
  
  // Return full IPFS URL
  return `ipfs://${ipfsHash}`;
}

/**
 * Upload JSON metadata to IPFS
 */
export async function uploadMetadataToIPFS(
  metadata: Record<string, any>
): Promise<string> {
  const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], {
    type: "application/json",
  });
  
  return uploadToIPFS(jsonBlob, "metadata.json");
}

/**
 * Convert IPFS URL to HTTP gateway URL
 */
export function ipfsToHttpUrl(ipfsUrl: string): string {
  if (ipfsUrl.startsWith("ipfs://")) {
    const hash = ipfsUrl.replace("ipfs://", "");
    return `https://ipfs.io/ipfs/${hash}`;
  }
  return ipfsUrl;
}

