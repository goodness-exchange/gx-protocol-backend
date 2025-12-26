/**
 * Enterprise RBAC Service
 *
 * Provides comprehensive Role-Based Access Control functionality:
 * - Granular permission checking (module:action:scope format)
 * - Custom role management
 * - Permission assignment and delegation
 * - Role hierarchy management
 * - Permission caching for performance
 */

import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { AdminRole } from '../types/admin-auth.types';

// Re-export permission category and risk level types (match Prisma schema)
type PermissionCategory = 'SYSTEM' | 'USER' | 'FINANCIAL' | 'DEPLOYMENT' | 'AUDIT' | 'CONFIG';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ============================================================================
// Types
// ============================================================================

export interface PermissionInfo {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: PermissionCategory;
  riskLevel: RiskLevel;
  requiresMfa: boolean;
  requiresApproval: boolean;
}

export interface RoleInfo {
  role: AdminRole;
  displayName: string;
  level: number;
  isSystemRole: boolean;
  permissions: string[];
}

export interface CustomRoleDefinition {
  name: string;
  displayName: string;
  description: string;
  baseRole?: AdminRole;
  permissions: string[];
  isActive: boolean;
}

export interface PermissionCheckResult {
  allowed: boolean;
  requiresMfa: boolean;
  requiresApproval: boolean;
  reason?: string;
}

export interface AdminPermissionContext {
  adminId: string;
  role: AdminRole;
  customPermissions: string[];
  mfaVerified: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const ROLE_HIERARCHY: Record<AdminRole, { level: number; displayName: string }> = {
  SUPER_OWNER: { level: 100, displayName: 'Super Owner' },
  SUPER_ADMIN: { level: 90, displayName: 'Super Administrator' },
  ADMIN: { level: 50, displayName: 'Administrator' },
  MODERATOR: { level: 30, displayName: 'Moderator' },
  DEVELOPER: { level: 20, displayName: 'Developer' },
  AUDITOR: { level: 10, displayName: 'Auditor' },
};

// Permission cache (simple in-memory, consider Redis for production)
const permissionCache = new Map<string, Set<string>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

// ============================================================================
// RBAC Service
// ============================================================================

class RBACService {
  // ==========================================================================
  // Permission Checking
  // ==========================================================================

  /**
   * Check if an admin has a specific permission
   */
  async checkPermission(
    context: AdminPermissionContext,
    permissionCode: string
  ): Promise<PermissionCheckResult> {
    try {
      // SUPER_OWNER has all permissions
      if (context.role === 'SUPER_OWNER') {
        const permission = await this.getPermissionByCode(permissionCode);
        return {
          allowed: true,
          requiresMfa: permission?.requiresMfa ?? false,
          requiresApproval: permission?.requiresApproval ?? false,
        };
      }

      // Get all permissions for admin
      const adminPermissions = await this.getAdminPermissions(context.adminId);

      // Check if permission exists in admin's permissions
      if (!adminPermissions.has(permissionCode)) {
        // Check for wildcard permissions (e.g., user:* matches user:view:all)
        const hasWildcardPermission = this.checkWildcardPermission(adminPermissions, permissionCode);
        if (!hasWildcardPermission) {
          return {
            allowed: false,
            requiresMfa: false,
            requiresApproval: false,
            reason: `Missing permission: ${permissionCode}`,
          };
        }
      }

      // Get permission details for MFA/approval requirements
      const permission = await this.getPermissionByCode(permissionCode);
      if (!permission) {
        return {
          allowed: false,
          requiresMfa: false,
          requiresApproval: false,
          reason: `Permission not found: ${permissionCode}`,
        };
      }

      // Check MFA requirement
      if (permission.requiresMfa && !context.mfaVerified) {
        return {
          allowed: false,
          requiresMfa: true,
          requiresApproval: permission.requiresApproval,
          reason: 'MFA verification required for this action',
        };
      }

      return {
        allowed: true,
        requiresMfa: permission.requiresMfa,
        requiresApproval: permission.requiresApproval,
      };
    } catch (error) {
      logger.error({ error, permissionCode, adminId: context.adminId }, 'Permission check failed');
      return {
        allowed: false,
        requiresMfa: false,
        requiresApproval: false,
        reason: 'Permission check failed due to internal error',
      };
    }
  }

  /**
   * Check multiple permissions (all must be granted)
   */
  async checkAllPermissions(
    context: AdminPermissionContext,
    permissionCodes: string[]
  ): Promise<PermissionCheckResult> {
    for (const code of permissionCodes) {
      const result = await this.checkPermission(context, code);
      if (!result.allowed) {
        return result;
      }
    }
    return { allowed: true, requiresMfa: false, requiresApproval: false };
  }

  /**
   * Check any of the permissions (at least one must be granted)
   */
  async checkAnyPermission(
    context: AdminPermissionContext,
    permissionCodes: string[]
  ): Promise<PermissionCheckResult> {
    for (const code of permissionCodes) {
      const result = await this.checkPermission(context, code);
      if (result.allowed) {
        return result;
      }
    }
    return {
      allowed: false,
      requiresMfa: false,
      requiresApproval: false,
      reason: `None of the required permissions: ${permissionCodes.join(', ')}`,
    };
  }

  // ==========================================================================
  // Permission Data Access
  // ==========================================================================

  /**
   * Get all permissions for an admin (from role + custom)
   */
  async getAdminPermissions(adminId: string): Promise<Set<string>> {
    // Check cache
    const cacheKey = `admin:${adminId}`;
    const cached = this.getCachedPermissions(cacheKey);
    if (cached) {
      return cached;
    }

    // Get admin with role
    const admin = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { role: true, customPermissions: true },
    });

    if (!admin) {
      return new Set();
    }

    // Get role permissions
    const rolePermissions = await this.getRolePermissions(admin.role);

    // Combine with custom permissions
    const allPermissions = new Set([...rolePermissions, ...admin.customPermissions]);

    // Cache results
    this.setCachedPermissions(cacheKey, allPermissions);

    return allPermissions;
  }

  /**
   * Get all permissions for a role
   */
  async getRolePermissions(role: AdminRole): Promise<Set<string>> {
    const cacheKey = `role:${role}`;
    const cached = this.getCachedPermissions(cacheKey);
    if (cached) {
      return cached;
    }

    const rolePerms = await db.rolePermission.findMany({
      where: { role },
      include: { permission: true },
    });

    const permissions = new Set<string>(rolePerms.map((rp: { permission: { code: string } }) => rp.permission.code));
    this.setCachedPermissions(cacheKey, permissions);

    return permissions;
  }

  /**
   * Get permission by code
   */
  async getPermissionByCode(code: string): Promise<PermissionInfo | null> {
    const permission = await db.permission.findUnique({
      where: { code },
    });
    return permission;
  }

  /**
   * Get all permissions
   */
  async getAllPermissions(): Promise<PermissionInfo[]> {
    return db.permission.findMany({
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });
  }

  /**
   * Get permissions by category
   */
  async getPermissionsByCategory(category: PermissionCategory): Promise<PermissionInfo[]> {
    return db.permission.findMany({
      where: { category },
      orderBy: { code: 'asc' },
    });
  }

  // ==========================================================================
  // Role Management
  // ==========================================================================

  /**
   * Get all system roles with their permissions
   */
  async getAllRoles(): Promise<RoleInfo[]> {
    const roles: RoleInfo[] = [];

    for (const [role, info] of Object.entries(ROLE_HIERARCHY)) {
      const permissions = await this.getRolePermissions(role as AdminRole);
      roles.push({
        role: role as AdminRole,
        displayName: info.displayName,
        level: info.level,
        isSystemRole: true,
        permissions: Array.from(permissions),
      });
    }

    return roles.sort((a, b) => b.level - a.level);
  }

  /**
   * Get role hierarchy level
   */
  getRoleLevel(role: AdminRole): number {
    return ROLE_HIERARCHY[role]?.level ?? 0;
  }

  /**
   * Check if one role is higher than another
   */
  isRoleHigherThan(role1: AdminRole, role2: AdminRole): boolean {
    return this.getRoleLevel(role1) > this.getRoleLevel(role2);
  }

  /**
   * Check if role can manage another role
   */
  canManageRole(managerRole: AdminRole, targetRole: AdminRole): boolean {
    // SUPER_OWNER can manage anyone
    if (managerRole === 'SUPER_OWNER') return true;
    // SUPER_ADMIN can manage everyone except SUPER_OWNER
    if (managerRole === 'SUPER_ADMIN' && targetRole !== 'SUPER_OWNER') return true;
    // Others can only manage lower roles
    return this.isRoleHigherThan(managerRole, targetRole);
  }

  // ==========================================================================
  // Permission Assignment
  // ==========================================================================

  /**
   * Grant custom permission to admin
   */
  async grantCustomPermission(
    adminId: string,
    permissionCode: string,
    grantedBy: string
  ): Promise<void> {
    // Verify permission exists
    const permission = await this.getPermissionByCode(permissionCode);
    if (!permission) {
      throw new Error(`Permission not found: ${permissionCode}`);
    }

    // Get admin
    const admin = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { customPermissions: true },
    });

    if (!admin) {
      throw new Error('Admin not found');
    }

    // Check if already has permission
    if (admin.customPermissions.includes(permissionCode)) {
      return; // Already granted
    }

    // Add permission
    await db.adminUser.update({
      where: { id: adminId },
      data: {
        customPermissions: [...admin.customPermissions, permissionCode],
      },
    });

    // Clear cache
    this.clearCacheForAdmin(adminId);

    logger.info({ adminId, permissionCode, grantedBy }, 'Custom permission granted');
  }

  /**
   * Revoke custom permission from admin
   */
  async revokeCustomPermission(
    adminId: string,
    permissionCode: string,
    revokedBy: string
  ): Promise<void> {
    const admin = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { customPermissions: true },
    });

    if (!admin) {
      throw new Error('Admin not found');
    }

    // Remove permission
    await db.adminUser.update({
      where: { id: adminId },
      data: {
        customPermissions: admin.customPermissions.filter((p: string) => p !== permissionCode),
      },
    });

    // Clear cache
    this.clearCacheForAdmin(adminId);

    logger.info({ adminId, permissionCode, revokedBy }, 'Custom permission revoked');
  }

  /**
   * Update admin role
   */
  async updateAdminRole(
    adminId: string,
    newRole: AdminRole,
    updatedBy: string
  ): Promise<void> {
    await db.adminUser.update({
      where: { id: adminId },
      data: { role: newRole },
    });

    // Clear cache
    this.clearCacheForAdmin(adminId);

    logger.info({ adminId, newRole, updatedBy }, 'Admin role updated');
  }

  /**
   * Assign permission to role
   */
  async assignPermissionToRole(
    role: AdminRole,
    permissionCode: string,
    canDelegate: boolean = false
  ): Promise<void> {
    const permission = await this.getPermissionByCode(permissionCode);
    if (!permission) {
      throw new Error(`Permission not found: ${permissionCode}`);
    }

    await db.rolePermission.upsert({
      where: { role_permissionId: { role, permissionId: permission.id } },
      update: { canDelegate },
      create: { role, permissionId: permission.id, canDelegate },
    });

    // Clear role cache
    this.clearCacheForRole(role);

    logger.info({ role, permissionCode, canDelegate }, 'Permission assigned to role');
  }

  /**
   * Remove permission from role
   */
  async removePermissionFromRole(role: AdminRole, permissionCode: string): Promise<void> {
    const permission = await this.getPermissionByCode(permissionCode);
    if (!permission) {
      return; // Nothing to remove
    }

    await db.rolePermission.deleteMany({
      where: { role, permissionId: permission.id },
    });

    // Clear role cache
    this.clearCacheForRole(role);

    logger.info({ role, permissionCode }, 'Permission removed from role');
  }

  // ==========================================================================
  // Admin Permission Summary
  // ==========================================================================

  /**
   * Get full permission summary for an admin
   */
  async getAdminPermissionSummary(adminId: string): Promise<{
    admin: { id: string; role: AdminRole; displayName: string };
    rolePermissions: PermissionInfo[];
    customPermissions: PermissionInfo[];
    effectivePermissions: PermissionInfo[];
    permissionsByCategory: Record<string, PermissionInfo[]>;
  }> {
    const admin = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, role: true, displayName: true, customPermissions: true },
    });

    if (!admin) {
      throw new Error('Admin not found');
    }

    // Get role permissions
    const rolePerms = await db.rolePermission.findMany({
      where: { role: admin.role },
      include: { permission: true },
    });
    const rolePermissions = rolePerms.map((rp: { permission: PermissionInfo }) => rp.permission);

    // Get custom permissions
    const customPermissions = await db.permission.findMany({
      where: { code: { in: admin.customPermissions } },
    });

    // Combine for effective permissions
    const allCodes = new Set<string>([
      ...rolePermissions.map((p: PermissionInfo) => p.code),
      ...admin.customPermissions,
    ]);

    const effectivePermissions = await db.permission.findMany({
      where: { code: { in: Array.from(allCodes) } },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });

    // Group by category
    const permissionsByCategory: Record<string, PermissionInfo[]> = {};
    for (const perm of effectivePermissions) {
      if (!permissionsByCategory[perm.category]) {
        permissionsByCategory[perm.category] = [];
      }
      permissionsByCategory[perm.category].push(perm);
    }

    return {
      admin: { id: admin.id, role: admin.role, displayName: admin.displayName },
      rolePermissions,
      customPermissions,
      effectivePermissions,
      permissionsByCategory,
    };
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  private getCachedPermissions(key: string): Set<string> | null {
    const timestamp = cacheTimestamps.get(key);
    if (!timestamp || Date.now() - timestamp > CACHE_TTL_MS) {
      permissionCache.delete(key);
      cacheTimestamps.delete(key);
      return null;
    }
    return permissionCache.get(key) ?? null;
  }

  private setCachedPermissions(key: string, permissions: Set<string>): void {
    permissionCache.set(key, permissions);
    cacheTimestamps.set(key, Date.now());
  }

  clearCacheForAdmin(adminId: string): void {
    permissionCache.delete(`admin:${adminId}`);
    cacheTimestamps.delete(`admin:${adminId}`);
  }

  clearCacheForRole(role: AdminRole): void {
    permissionCache.delete(`role:${role}`);
    cacheTimestamps.delete(`role:${role}`);
    // Also clear all admin caches since their role permissions may have changed
    // In production, you'd want more selective invalidation
    permissionCache.clear();
    cacheTimestamps.clear();
  }

  clearAllCache(): void {
    permissionCache.clear();
    cacheTimestamps.clear();
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private checkWildcardPermission(permissions: Set<string>, targetPermission: string): boolean {
    const parts = targetPermission.split(':');

    // Check for exact match first
    if (permissions.has(targetPermission)) return true;

    // Check for wildcard patterns
    // e.g., "user:*" matches "user:view:all"
    // e.g., "user:view:*" matches "user:view:all"
    for (let i = parts.length - 1; i >= 0; i--) {
      const wildcardPattern = [...parts.slice(0, i), '*'].join(':');
      if (permissions.has(wildcardPattern)) return true;
    }

    return false;
  }
}

// Export singleton instance
export const rbacService = new RBACService();
