import { User } from "./schema";
import { db } from "./db";
import { userRoles } from "./schema";
import { eq, inArray } from "drizzle-orm";

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
 * Check if user has curator role (fetches roles from DB if needed)
 * Note: admin and superadmin do NOT automatically confer curator permissions
 */
export async function hasCuratorOrAdminRoleUser(user: User | null | undefined, roles?: string[]): Promise<boolean> {
  if (!user) return false;
  const userRoles = roles || await getUserRoles(user.fid);
  return hasCuratorOrAdminRole(userRoles);
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
 * Check if user has plus role (fetches roles from DB if needed)
 */
export async function hasPlusRoleUser(user: User | null | undefined, roles?: string[]): Promise<boolean> {
  if (!user) return false;
  const userRoles = roles || await getUserRoles(user.fid);
  return hasPlusRole(userRoles);
}

/**
 * Get all user FIDs that have admin or superadmin roles
 */
export async function getAllAdminFids(): Promise<number[]> {
  const adminRoles = await db
    .select({ userFid: userRoles.userFid })
    .from(userRoles)
    .where(inArray(userRoles.role, ["admin", "superadmin"]));
  
  return adminRoles.map((r) => r.userFid);
}

