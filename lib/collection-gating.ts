import { User } from "./schema";
import { getUserRoles } from "./roles";

export type GatingRuleType = "display_name_contains_emoji" | "has_role" | "user_fid";

export interface GatingRule {
  type: GatingRuleType;
  emoji?: string; // For display_name_contains_emoji
  role?: string; // For has_role
  fid?: number; // For user_fid
}

/**
 * Evaluate a gating rule against a user
 * @param rule - The gating rule to evaluate
 * @param user - The user to check
 * @returns true if user passes the rule, false otherwise
 */
export async function evaluateGatingRule(rule: GatingRule, user: User | null): Promise<boolean> {
  if (!user) {
    return false;
  }

  switch (rule.type) {
    case "display_name_contains_emoji":
      if (!rule.emoji) {
        return false;
      }
      return user.displayName?.includes(rule.emoji) ?? false;

    case "has_role":
      if (!rule.role) {
        return false;
      }
      const roles = await getUserRoles(user.fid);
      return roles.includes(rule.role);

    case "user_fid":
      if (!rule.fid) {
        return false;
      }
      return user.fid === rule.fid;

    default:
      return false;
  }
}

/**
 * Check if a user can add casts to a collection based on access type and gating rules
 * @param accessType - The collection access type ('open', 'gated_user', 'gated_rule')
 * @param gatedUserId - The gated user ID (for 'gated_user' type)
 * @param gatingRule - The gating rule (for 'gated_rule' type)
 * @param user - The user to check
 * @returns true if user can add to collection, false otherwise
 */
export async function canUserAddToCollection(
  accessType: string,
  gatedUserId: number | null,
  gatingRule: GatingRule | null,
  user: User | null
): Promise<boolean> {
  if (!user) {
    return false;
  }

  switch (accessType) {
    case "open":
      return true;

    case "gated_user":
      if (!gatedUserId) {
        return false;
      }
      return user.fid === gatedUserId;

    case "gated_rule":
      if (!gatingRule) {
        return false;
      }
      return await evaluateGatingRule(gatingRule, user);

    default:
      return false;
  }
}

