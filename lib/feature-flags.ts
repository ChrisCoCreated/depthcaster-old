/**
 * Feature flag system for controlling feature availability
 */

export const FEATURE_FLAGS = {
  COLLECTIONS_ENABLED: "COLLECTIONS_ENABLED",
  COLLECTIONS_ENABLED_FOR_SUPERADMINS: "COLLECTIONS_ENABLED_FOR_SUPERADMINS",
} as const;

export type FeatureFlag = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

/**
 * Check if a feature is enabled
 * @param feature - The feature flag name
 * @returns true if feature is enabled, false otherwise
 */
export function isFeatureEnabled(feature: FeatureFlag): boolean {
  const envValue = process.env[feature];
  return envValue === "true" || envValue === "1";
}

/**
 * Client-side version that checks from environment variable
 * Note: Only works for public env vars (NEXT_PUBLIC_*)
 */
export function isFeatureEnabledClient(feature: FeatureFlag): boolean {
  const envValue = process.env[`NEXT_PUBLIC_${feature}`];
  return envValue === "true" || envValue === "1";
}

