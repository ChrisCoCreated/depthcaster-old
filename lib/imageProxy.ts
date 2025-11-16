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

