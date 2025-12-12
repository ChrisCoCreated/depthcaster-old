/**
 * Client-safe role utilities
 * 
 * This file contains only pure functions and constants that don't require database access.
 * Use this file in client components instead of lib/roles.ts to avoid database connection errors.
 */

/**
 * Centralized array of curator roles
 * Only includes curator role - admin and superadmin do NOT automatically confer curator permissions
 * Curator must be granted explicitly
 */
export const CURATOR_ROLES = ["curator"] as const;

export type CuratorRole = typeof CURATOR_ROLES[number];

/**
 * Centralized array of plus roles
 */
export const PLUS_ROLES = ["plus"] as const;

export type PlusRole = typeof PLUS_ROLES[number];

/**
 * Centralized array of collections roles
 */
export const COLLECTIONS_ROLES = ["collections", "collector"] as const;

export type CollectionsRole = typeof COLLECTIONS_ROLES[number];

/**
 * Check if any role in the array is a curator role
 * Note: admin and superadmin do NOT automatically confer curator permissions
 */
export function hasCuratorOrAdminRole(roles: string[] | string | null | undefined): boolean {
  if (!roles) return false;
  const roleArray = Array.isArray(roles) ? roles : [roles];
  return roleArray.some((role) => CURATOR_ROLES.includes(role as CuratorRole));
}

/**
 * Check if any role in the array is admin or superadmin
 */
export function isAdmin(roles: string[] | string | null | undefined): boolean {
  if (!roles) return false;
  const roleArray = Array.isArray(roles) ? roles : [roles];
  return roleArray.includes("admin") || roleArray.includes("superadmin");
}

/**
 * Check if any role in the array is superadmin
 */
export function isSuperAdmin(roles: string[] | string | null | undefined): boolean {
  if (!roles) return false;
  const roleArray = Array.isArray(roles) ? roles : [roles];
  return roleArray.includes("superadmin");
}

/**
 * Check if any role in the array is a plus role
 */
export function hasPlusRole(roles: string[] | string | null | undefined): boolean {
  if (!roles) return false;
  const roleArray = Array.isArray(roles) ? roles : [roles];
  return roleArray.some((role) => PLUS_ROLES.includes(role as PlusRole));
}

/**
 * Check if any role in the array is collections role
 */
export function hasCollectionsRole(roles: string[] | string | null | undefined): boolean {
  if (!roles) return false;
  const roleArray = Array.isArray(roles) ? roles : [roles];
  return roleArray.some((role) => COLLECTIONS_ROLES.includes(role as CollectionsRole));
}

/**
 * Check if any role in the array is collections role or admin/superadmin
 */
export function hasCollectionsOrAdminRole(roles: string[] | string | null | undefined): boolean {
  if (!roles) return false;
  const roleArray = Array.isArray(roles) ? roles : [roles];
  return hasCollectionsRole(roleArray) || isAdmin(roleArray);
}
