/**
 * RBAC Controller
 *
 * Provides API endpoints for enterprise Role-Based Access Control:
 * - Permission listing and details
 * - Role management
 * - Admin permission management
 * - Permission checking
 */

import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { rbacService } from '../services/rbac.service';
import { AdminAuthenticatedRequest } from '../types/admin-auth.types';
import type {
  GrantPermissionRequestDTO,
  RevokePermissionRequestDTO,
  UpdateAdminRoleRequestDTO,
  BulkPermissionUpdateRequestDTO,
  AssignRolePermissionRequestDTO,
  PermissionCheckRequestDTO,
  BulkPermissionCheckRequestDTO,
} from '../types/rbac.types';
import { db } from '@gx/core-db';

// ============================================================================
// Permission Endpoints
// ============================================================================

/**
 * GET /api/v1/admin/rbac/permissions
 * Get all permissions
 */
export const getAllPermissions = async (
  _req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const permissions = await rbacService.getAllPermissions();

    // Group by category
    const byCategory: Record<string, typeof permissions> = {};
    for (const perm of permissions) {
      if (!byCategory[perm.category]) {
        byCategory[perm.category] = [];
      }
      byCategory[perm.category].push(perm);
    }

    res.json({
      permissions,
      total: permissions.length,
      byCategory,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get permissions');
    res.status(500).json({ error: 'Failed to retrieve permissions' });
  }
};

/**
 * GET /api/v1/admin/rbac/permissions/:code
 * Get permission by code
 */
export const getPermissionByCode = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { code } = req.params;
    const permission = await rbacService.getPermissionByCode(code);

    if (!permission) {
      res.status(404).json({ error: 'Permission not found' });
      return;
    }

    res.json(permission);
  } catch (error) {
    logger.error({ error }, 'Failed to get permission');
    res.status(500).json({ error: 'Failed to retrieve permission' });
  }
};

/**
 * GET /api/v1/admin/rbac/permissions/category/:category
 * Get permissions by category
 */
export const getPermissionsByCategory = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { category } = req.params;
    const validCategories = ['SYSTEM', 'USER', 'FINANCIAL', 'DEPLOYMENT', 'AUDIT', 'CONFIG'];

    if (!validCategories.includes(category.toUpperCase())) {
      res.status(400).json({
        error: 'Invalid category',
        validCategories,
      });
      return;
    }

    const permissions = await rbacService.getPermissionsByCategory(category.toUpperCase() as any);
    res.json({ category, permissions, total: permissions.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get permissions by category');
    res.status(500).json({ error: 'Failed to retrieve permissions' });
  }
};

// ============================================================================
// Role Endpoints
// ============================================================================

/**
 * GET /api/v1/admin/rbac/roles
 * Get all roles with summary
 */
export const getAllRoles = async (
  _req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const roles = await rbacService.getAllRoles();

    const rolesSummary = roles.map((role) => ({
      role: role.role,
      displayName: role.displayName,
      level: role.level,
      isSystemRole: role.isSystemRole,
      permissionCount: role.permissions.length,
    }));

    res.json({ roles: rolesSummary });
  } catch (error) {
    logger.error({ error }, 'Failed to get roles');
    res.status(500).json({ error: 'Failed to retrieve roles' });
  }
};

/**
 * GET /api/v1/admin/rbac/roles/:role
 * Get role details with permissions
 */
export const getRoleDetails = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { role } = req.params;
    const validRoles = ['SUPER_OWNER', 'SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'DEVELOPER', 'AUDITOR'];

    if (!validRoles.includes(role.toUpperCase())) {
      res.status(400).json({ error: 'Invalid role', validRoles });
      return;
    }

    const allRoles = await rbacService.getAllRoles();
    const roleInfo = allRoles.find((r) => r.role === role.toUpperCase());

    if (!roleInfo) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    // Get full permission details
    const permissions = await db.permission.findMany({
      where: { code: { in: roleInfo.permissions } },
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    });

    res.json({
      ...roleInfo,
      permissions,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get role details');
    res.status(500).json({ error: 'Failed to retrieve role details' });
  }
};

/**
 * GET /api/v1/admin/rbac/matrix
 * Get permission matrix (permissions x roles)
 */
export const getPermissionMatrix = async (
  _req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const allPermissions = await rbacService.getAllPermissions();
    const allRoles = await rbacService.getAllRoles();

    const matrix = {
      permissions: allPermissions,
      roles: allRoles.map((role) => {
        const permissionSet = new Set(role.permissions);
        const permissionMap: Record<string, boolean> = {};

        for (const perm of allPermissions) {
          permissionMap[perm.code] = permissionSet.has(perm.code);
        }

        return {
          role: role.role,
          displayName: role.displayName,
          permissions: permissionMap,
        };
      }),
    };

    res.json(matrix);
  } catch (error) {
    logger.error({ error }, 'Failed to get permission matrix');
    res.status(500).json({ error: 'Failed to retrieve permission matrix' });
  }
};

// ============================================================================
// Admin Permission Endpoints
// ============================================================================

/**
 * GET /api/v1/admin/rbac/admins/:adminId/permissions
 * Get admin's permission summary
 */
export const getAdminPermissions = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { adminId } = req.params;

    // Check if requester can view this admin's permissions
    if (req.admin?.role !== 'SUPER_OWNER' && req.admin?.role !== 'SUPER_ADMIN') {
      // Non-super admins can only view their own permissions
      if (req.admin?.adminId !== adminId) {
        res.status(403).json({ error: 'Cannot view other admin permissions' });
        return;
      }
    }

    const summary = await rbacService.getAdminPermissionSummary(adminId);
    res.json(summary);
  } catch (error) {
    logger.error({ error }, 'Failed to get admin permissions');
    res.status(500).json({ error: 'Failed to retrieve admin permissions' });
  }
};

/**
 * GET /api/v1/admin/rbac/my-permissions
 * Get current admin's permission summary
 */
export const getMyPermissions = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.admin) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const summary = await rbacService.getAdminPermissionSummary(req.admin.adminId);
    res.json(summary);
  } catch (error) {
    logger.error({ error }, 'Failed to get own permissions');
    res.status(500).json({ error: 'Failed to retrieve permissions' });
  }
};

/**
 * POST /api/v1/admin/rbac/admins/:adminId/permissions/grant
 * Grant custom permission to admin
 */
export const grantPermission = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { adminId } = req.params;
    const { permissionCode } = req.body as GrantPermissionRequestDTO;

    if (!permissionCode) {
      res.status(400).json({ error: 'permissionCode is required' });
      return;
    }

    // Only SUPER_OWNER and SUPER_ADMIN can grant permissions
    if (req.admin?.role !== 'SUPER_OWNER' && req.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Insufficient permissions to grant permissions' });
      return;
    }

    // Check target admin exists and can be managed
    const targetAdmin = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { role: true },
    });

    if (!targetAdmin) {
      res.status(404).json({ error: 'Admin not found' });
      return;
    }

    if (!rbacService.canManageRole(req.admin.role, targetAdmin.role)) {
      res.status(403).json({ error: 'Cannot manage admins with higher or equal role' });
      return;
    }

    await rbacService.grantCustomPermission(adminId, permissionCode, req.admin.adminId);

    res.json({ success: true, message: `Permission ${permissionCode} granted to admin` });
  } catch (error) {
    logger.error({ error }, 'Failed to grant permission');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to grant permission' });
  }
};

/**
 * POST /api/v1/admin/rbac/admins/:adminId/permissions/revoke
 * Revoke custom permission from admin
 */
export const revokePermission = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { adminId } = req.params;
    const { permissionCode } = req.body as RevokePermissionRequestDTO;

    if (!permissionCode) {
      res.status(400).json({ error: 'permissionCode is required' });
      return;
    }

    // Only SUPER_OWNER and SUPER_ADMIN can revoke permissions
    if (req.admin?.role !== 'SUPER_OWNER' && req.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Insufficient permissions to revoke permissions' });
      return;
    }

    // Check target admin
    const targetAdmin = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { role: true },
    });

    if (!targetAdmin) {
      res.status(404).json({ error: 'Admin not found' });
      return;
    }

    if (!rbacService.canManageRole(req.admin.role, targetAdmin.role)) {
      res.status(403).json({ error: 'Cannot manage admins with higher or equal role' });
      return;
    }

    await rbacService.revokeCustomPermission(adminId, permissionCode, req.admin.adminId);

    res.json({ success: true, message: `Permission ${permissionCode} revoked from admin` });
  } catch (error) {
    logger.error({ error }, 'Failed to revoke permission');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to revoke permission' });
  }
};

/**
 * PUT /api/v1/admin/rbac/admins/:adminId/role
 * Update admin's role
 */
export const updateAdminRole = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { adminId } = req.params;
    const { newRole, reason } = req.body as UpdateAdminRoleRequestDTO;

    const validRoles = ['SUPER_OWNER', 'SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'DEVELOPER', 'AUDITOR'];
    if (!newRole || !validRoles.includes(newRole)) {
      res.status(400).json({ error: 'Valid newRole is required', validRoles });
      return;
    }

    // Only SUPER_OWNER can assign SUPER_OWNER or SUPER_ADMIN roles
    if ((newRole === 'SUPER_OWNER' || newRole === 'SUPER_ADMIN') && req.admin?.role !== 'SUPER_OWNER') {
      res.status(403).json({ error: 'Only SUPER_OWNER can assign SUPER_OWNER or SUPER_ADMIN roles' });
      return;
    }

    // SUPER_ADMIN can assign lower roles
    if (req.admin?.role !== 'SUPER_OWNER' && req.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Insufficient permissions to change roles' });
      return;
    }

    // Check target admin
    const targetAdmin = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { role: true, username: true },
    });

    if (!targetAdmin) {
      res.status(404).json({ error: 'Admin not found' });
      return;
    }

    // Cannot demote yourself
    if (adminId === req.admin?.adminId) {
      res.status(400).json({ error: 'Cannot change your own role' });
      return;
    }

    if (!rbacService.canManageRole(req.admin!.role, targetAdmin.role)) {
      res.status(403).json({ error: 'Cannot manage admins with higher or equal role' });
      return;
    }

    await rbacService.updateAdminRole(adminId, newRole, req.admin!.adminId);

    logger.info({
      adminId,
      previousRole: targetAdmin.role,
      newRole,
      changedBy: req.admin!.adminId,
      reason,
    }, 'Admin role updated');

    res.json({
      success: true,
      message: `Admin ${targetAdmin.username} role updated from ${targetAdmin.role} to ${newRole}`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update admin role');
    res.status(500).json({ error: 'Failed to update admin role' });
  }
};

/**
 * PUT /api/v1/admin/rbac/admins/:adminId/permissions/bulk
 * Bulk update admin permissions
 */
export const bulkUpdatePermissions = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { adminId } = req.params;
    const { permissionsToGrant, permissionsToRevoke } = req.body as BulkPermissionUpdateRequestDTO;

    // Only SUPER_OWNER and SUPER_ADMIN can bulk update
    if (req.admin?.role !== 'SUPER_OWNER' && req.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Check target admin
    const targetAdmin = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { role: true },
    });

    if (!targetAdmin) {
      res.status(404).json({ error: 'Admin not found' });
      return;
    }

    if (!rbacService.canManageRole(req.admin.role, targetAdmin.role)) {
      res.status(403).json({ error: 'Cannot manage admins with higher or equal role' });
      return;
    }

    const results = { granted: [] as string[], revoked: [] as string[], errors: [] as string[] };

    // Grant permissions
    for (const code of permissionsToGrant || []) {
      try {
        await rbacService.grantCustomPermission(adminId, code, req.admin.adminId);
        results.granted.push(code);
      } catch (err) {
        results.errors.push(`Grant ${code}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Revoke permissions
    for (const code of permissionsToRevoke || []) {
      try {
        await rbacService.revokeCustomPermission(adminId, code, req.admin.adminId);
        results.revoked.push(code);
      } catch (err) {
        results.errors.push(`Revoke ${code}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    res.json({
      success: results.errors.length === 0,
      results,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to bulk update permissions');
    res.status(500).json({ error: 'Failed to bulk update permissions' });
  }
};

// ============================================================================
// Role Permission Management (SUPER_OWNER only)
// ============================================================================

/**
 * POST /api/v1/admin/rbac/roles/:role/permissions
 * Assign permission to role
 */
export const assignRolePermission = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    // Only SUPER_OWNER can modify role permissions
    if (req.admin?.role !== 'SUPER_OWNER') {
      res.status(403).json({ error: 'Only SUPER_OWNER can modify role permissions' });
      return;
    }

    const { role } = req.params;
    const { permissionCode, canDelegate } = req.body as AssignRolePermissionRequestDTO;

    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'DEVELOPER', 'AUDITOR'];
    if (!validRoles.includes(role.toUpperCase())) {
      res.status(400).json({ error: 'Invalid role or cannot modify SUPER_OWNER permissions' });
      return;
    }

    if (!permissionCode) {
      res.status(400).json({ error: 'permissionCode is required' });
      return;
    }

    await rbacService.assignPermissionToRole(role.toUpperCase() as any, permissionCode, canDelegate ?? false);

    res.json({ success: true, message: `Permission ${permissionCode} assigned to ${role}` });
  } catch (error) {
    logger.error({ error }, 'Failed to assign role permission');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to assign permission' });
  }
};

/**
 * DELETE /api/v1/admin/rbac/roles/:role/permissions/:permissionCode
 * Remove permission from role
 */
export const removeRolePermission = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    // Only SUPER_OWNER can modify role permissions
    if (req.admin?.role !== 'SUPER_OWNER') {
      res.status(403).json({ error: 'Only SUPER_OWNER can modify role permissions' });
      return;
    }

    const { role, permissionCode } = req.params;

    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'DEVELOPER', 'AUDITOR'];
    if (!validRoles.includes(role.toUpperCase())) {
      res.status(400).json({ error: 'Invalid role or cannot modify SUPER_OWNER permissions' });
      return;
    }

    await rbacService.removePermissionFromRole(role.toUpperCase() as any, permissionCode);

    res.json({ success: true, message: `Permission ${permissionCode} removed from ${role}` });
  } catch (error) {
    logger.error({ error }, 'Failed to remove role permission');
    res.status(500).json({ error: 'Failed to remove permission' });
  }
};

// ============================================================================
// Permission Check Endpoints
// ============================================================================

/**
 * POST /api/v1/admin/rbac/check
 * Check if current admin has a permission
 */
export const checkPermission = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.admin) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { permissionCode } = req.body as PermissionCheckRequestDTO;

    if (!permissionCode) {
      res.status(400).json({ error: 'permissionCode is required' });
      return;
    }

    const result = await rbacService.checkPermission(
      {
        adminId: req.admin.adminId,
        role: req.admin.role,
        customPermissions: [], // Will be loaded by service
        mfaVerified: req.admin.mfaVerified,
      },
      permissionCode
    );

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Permission check failed');
    res.status(500).json({ error: 'Permission check failed' });
  }
};

/**
 * POST /api/v1/admin/rbac/check/bulk
 * Check multiple permissions
 */
export const checkBulkPermissions = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.admin) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { permissionCodes, checkMode } = req.body as BulkPermissionCheckRequestDTO;

    if (!permissionCodes || !Array.isArray(permissionCodes)) {
      res.status(400).json({ error: 'permissionCodes array is required' });
      return;
    }

    const context = {
      adminId: req.admin.adminId,
      role: req.admin.role,
      customPermissions: [],
      mfaVerified: req.admin.mfaVerified,
    };

    const result = checkMode === 'any'
      ? await rbacService.checkAnyPermission(context, permissionCodes)
      : await rbacService.checkAllPermissions(context, permissionCodes);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Bulk permission check failed');
    res.status(500).json({ error: 'Permission check failed' });
  }
};

// ============================================================================
// Cache Management (SUPER_OWNER only)
// ============================================================================

/**
 * POST /api/v1/admin/rbac/cache/clear
 * Clear permission cache
 */
export const clearCache = async (
  req: AdminAuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (req.admin?.role !== 'SUPER_OWNER') {
      res.status(403).json({ error: 'Only SUPER_OWNER can clear cache' });
      return;
    }

    rbacService.clearAllCache();
    res.json({ success: true, message: 'Permission cache cleared' });
  } catch (error) {
    logger.error({ error }, 'Failed to clear cache');
    res.status(500).json({ error: 'Failed to clear cache' });
  }
};
