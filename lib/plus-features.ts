/**
 * Plus feature configuration system
 * 
 * This file centralizes all plus role features, making it easy to:
 * 1. Add new features by adding a key to PLUS_FEATURES
 * 2. Adjust feature values for plus vs default users
 * 3. Use helper functions to check feature access
 */

export const PLUS_FEATURES = {
  /**
   * Maximum number of users in "My X" combined feed
   * Plus users: 37
   * Default users: 7
   */
  MY_USERS_MAX: {
    plus: 37,
    default: 7,
  },
  /**
   * Access to neynar updates/feature updates page
   * Plus users: true
   * Default users: false
   */
  NEYNAR_UPDATES_ACCESS: {
    plus: true,
    default: false,
  },
} as const;

export type PlusFeatureKey = keyof typeof PLUS_FEATURES;

/**
 * Get feature value based on whether user has plus role
 * @param featureKey - The feature key from PLUS_FEATURES
 * @param hasPlusRole - Whether the user has the plus role
 * @returns The feature value (plus value if hasPlusRole, otherwise default value)
 */
export function getFeatureValue<T extends PlusFeatureKey>(
  featureKey: T,
  hasPlusRole: boolean
): typeof PLUS_FEATURES[T]["plus"] | typeof PLUS_FEATURES[T]["default"] {
  const feature = PLUS_FEATURES[featureKey];
  return hasPlusRole ? feature.plus : feature.default;
}

/**
 * Get maximum number of users for "My X" combined feed
 * Plus users get 37, default users get 7
 */
export function getMaxMyUsers(hasPlusRole: boolean): number {
  return getFeatureValue("MY_USERS_MAX", hasPlusRole) as number;
}

/**
 * Check if user has access to neynar updates/feature updates
 * Plus users have access, default users do not
 */
export function hasNeynarUpdatesAccess(hasPlusRole: boolean): boolean {
  return getFeatureValue("NEYNAR_UPDATES_ACCESS", hasPlusRole) as boolean;
}








