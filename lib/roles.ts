import { User } from "./schema";

export function hasCuratorOrAdminRole(role: string | null | undefined): boolean {
  return role === "curator" || role === "admin" || role === "superadmin";
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

