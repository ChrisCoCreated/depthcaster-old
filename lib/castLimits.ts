export const STANDARD_CAST_BYTE_LIMIT = 320;
export const PRO_CAST_BYTE_LIMIT = 10_000;

export type ProSubscriptionLike = {
  pro?:
    | {
        status?: string | null;
        [key: string]: unknown;
      }
    | null;
} | null;

export function hasActiveProSubscription(entity: ProSubscriptionLike | undefined): boolean {
  const status = entity?.pro?.status;
  if (typeof status !== "string") {
    return false;
  }
  return status.toLowerCase() === "subscribed";
}

export function getMaxCastBytes(isPro: boolean): number {
  return isPro ? PRO_CAST_BYTE_LIMIT : STANDARD_CAST_BYTE_LIMIT;
}

let cachedTextEncoder: TextEncoder | null =
  typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

export function getUtf8ByteLength(value: string): number {
  if (!value) {
    return 0;
  }

  if (cachedTextEncoder) {
    return cachedTextEncoder.encode(value).length;
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf-8").length;
  }

  // Fallback to string length if TextEncoder/Buffer are unavailable (shouldn't happen)
  return value.length;
}




