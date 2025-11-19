const PROXY_ALLOWLIST = ["imgur.com", "i.imgur.com", "images.imgur.com", "i.redd.it", "i.ibb.co"];

function hostnameMatches(hostname: string, allowed: string) {
  return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

export function sanitizeImageUrl(input?: string | null): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function shouldProxyImageUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }

  try {
    const { hostname } = new URL(url);
    return PROXY_ALLOWLIST.some((allowed) => hostnameMatches(hostname.toLowerCase(), allowed));
  } catch {
    return false;
  }
}

export function buildProxiedImageUrl(url: string) {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Try to convert Imgur URLs to alternative formats that might work better
 * e.g., i.imgur.com/ID.jpg -> imgur.com/ID.jpg or vice versa
 */
export function getAlternativeImgurUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // If it's an i.imgur.com URL, try imgur.com instead
    if (hostname === "i.imgur.com") {
      parsed.hostname = "imgur.com";
      return parsed.toString();
    }
    
    // If it's imgur.com, try i.imgur.com
    if (hostname === "imgur.com" && parsed.pathname.match(/^\/[a-zA-Z0-9]+\.(jpg|jpeg|png|gif|webp)$/i)) {
      parsed.hostname = "i.imgur.com";
      return parsed.toString();
    }
    
    return null;
  } catch {
    return null;
  }
}

export function isExternalUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export async function proxyRemoteImage(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Depthcaster Image Proxy",
      Accept: "image/*",
    },
    cache: "no-store",
  });

  return response;
}

export { PROXY_ALLOWLIST };


