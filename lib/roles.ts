import { User } from "./schema";

/**
 * Centralized array of curator roles
 * Includes curator, admin, and superadmin roles
 * Update this array to change which roles are considered curators across the app
 */
export const CURATOR_ROLES = ["curator", "admin", "superadmin"] as const;

export type CuratorRole = typeof CURATOR_ROLES[number];

/**
 * Check if a role is a curator role (includes curator, admin, superadmin)
 */
export function hasCuratorOrAdminRole(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && CURATOR_ROLES.includes(role as CuratorRole);
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin" || role === "superadmin";
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "superadmin";
}

export function isAdminUser(user: User | null | undefined): boolean {
  return user ? isAdmin(user.role) : false;
}

export function isSuperAdminUser(user: User | null | undefined): boolean {
  return user ? isSuperAdmin(user.role) : false;
}

export function hasCuratorOrAdminRoleUser(user: User | null | undefined): boolean {
  return user ? hasCuratorOrAdminRole(user.role) : false;
}

