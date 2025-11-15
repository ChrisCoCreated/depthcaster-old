import { User } from "./schema";
import { db } from "./db";
import { userRoles } from "./schema";
import { eq } from "drizzle-orm";

/**
 * Centralized array of curator roles
 * Includes curator, admin, and superadmin roles
 * Update this array to change which roles are considered curators across the app
 */
export const CURATOR_ROLES = ["curator", "admin", "superadmin"] as const;

export type CuratorRole = typeof CURATOR_ROLES[number];

/**
 * Fetch user's roles from the database
 */
export async function getUserRoles(fid: number): Promise<string[]> {
  const roles = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userFid, fid));
  
  return roles.map((r) => r.role);
}

/**
 * Check if any role in the array is a curator role (includes curator, admin, superadmin)
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
 * Check if user has admin role (fetches roles from DB if needed)
 */
export async function isAdminUser(user: User | null | undefined, roles?: string[]): Promise<boolean> {
  if (!user) return false;
  const userRoles = roles || await getUserRoles(user.fid);
  return isAdmin(userRoles);
}

/**
 * Check if user has superadmin role (fetches roles from DB if needed)
 */
export async function isSuperAdminUser(user: User | null | undefined, roles?: string[]): Promise<boolean> {
  if (!user) return false;
  const userRoles = roles || await getUserRoles(user.fid);
  return isSuperAdmin(userRoles);
}

/**
 * Check if user has curator or admin role (fetches roles from DB if needed)
 */
export async function hasCuratorOrAdminRoleUser(user: User | null | undefined, roles?: string[]): Promise<boolean> {
  if (!user) return false;
  const userRoles = roles || await getUserRoles(user.fid);
  return hasCuratorOrAdminRole(userRoles);
}

