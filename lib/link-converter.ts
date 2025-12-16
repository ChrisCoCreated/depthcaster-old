/**
 * Link conversion utilities for converting external Farcaster links to Sopha links
 * This avoids unnecessary Neynar API calls by extracting cast hashes directly from URLs
 */

/**
 * Extracts cast hash from various Farcaster URL formats
 * @param url - The URL to extract hash from
 * @returns The cast hash (0x...) or null if not found
 */
export function extractCastHashFromUrl(url: string): string | null {
  // base.app format: https://base.app/post/0x44183d2c4d8fc8a981e7115f43b9ac0de26da03a
  const baseAppPattern = /base\.app\/post\/(0x[a-fA-F0-9]{8,})/i;
  const baseAppMatch = url.match(baseAppPattern);
  if (baseAppMatch) {
    return baseAppMatch[1];
  }

  // warpcast.com format: https://warpcast.com/username/cast/0x...
  const warpcastPattern = /warpcast\.com\/[^\/]+\/cast\/(0x[a-fA-F0-9]{8,})/i;
  const warpcastMatch = url.match(warpcastPattern);
  if (warpcastMatch) {
    return warpcastMatch[1];
  }

  // farcaster.xyz format: https://farcaster.xyz/username/0x...
  const farcasterPattern = /farcaster\.xyz\/[^\/]+\/(0x[a-fA-F0-9]{8,})/i;
  const farcasterMatch = url.match(farcasterPattern);
  if (farcasterMatch) {
    return farcasterMatch[1];
  }

  // Generic /cast/0x... pattern
  const castPattern = /\/cast\/(0x[a-fA-F0-9]{8,})/i;
  const castMatch = url.match(castPattern);
  if (castMatch) {
    return castMatch[1];
  }

  return null;
}

/**
 * Converts a Farcaster URL to a Sopha link
 * @param url - The external Farcaster URL
 * @returns Sopha link (/cast/[hash]) or original URL if hash not found
 */
export function convertToSophaLink(url: string): string {
  const hash = extractCastHashFromUrl(url);
  if (hash) {
    return `/cast/${hash}`;
  }
  return url;
}

/**
 * Checks if a URL is a base.app link
 */
export function isBaseAppLink(url: string): boolean {
  return /base\.app\/post\//i.test(url);
}

/**
 * Checks if a URL is a Farcaster link (farcaster.xyz, warpcast.com, base.app)
 */
export function isFarcasterLink(url: string): boolean {
  return /(farcaster\.xyz|warpcast\.com|base\.app)/i.test(url);
}

/**
 * Converts base.app links to Sopha links inline
 * This is used for rendering text where we want to convert links immediately
 */
export function convertBaseAppLinksInline(text: string): string {
  const baseAppPattern = /(https?:\/\/base\.app\/post\/0x[a-fA-F0-9]{8,})/gi;
  return text.replace(baseAppPattern, (match) => {
    const hash = extractCastHashFromUrl(match);
    if (hash) {
      return `/cast/${hash}`;
    }
    return match;
  });
}

