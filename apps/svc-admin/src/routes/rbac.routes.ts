/**
 * RBAC Routes
 *
 * Enterprise Role-Based Access Control API routes
 */

import { Router } from 'express';
import { authenticateAdminJWT, requireAdminRole, requireMfaVerified } from '../middlewares/admin-auth.middleware';
import * as rbacController from '../controllers/rbac.controller';

const router = Router();

// All RBAC routes require authentication
router.use(authenticateAdminJWT);

// ============================================================================
// Permission Routes (Read access for all admins)
// ============================================================================

/**
 * @route   GET /api/v1/admin/rbac/permissions
 * @desc    Get all permissions
 * @access  All authenticated admins
 */
router.get('/permissions', rbacController.getAllPermissions);

/**
 * @route   GET /api/v1/admin/rbac/permissions/category/:category
 * @desc    Get permissions by category
 * @access  All authenticated admins
 */
router.get('/permissions/category/:category', rbacController.getPermissionsByCategory);

/**
 * @route   GET /api/v1/admin/rbac/permissions/:code
 * @desc    Get permission by code
 * @access  All authenticated admins
 */
router.get('/permissions/:code', rbacController.getPermissionByCode);

// ============================================================================
// Role Routes
// ============================================================================

/**
 * @route   GET /api/v1/admin/rbac/roles
 * @desc    Get all roles with summary
 * @access  All authenticated admins
 */
router.get('/roles', rbacController.getAllRoles);

/**
 * @route   GET /api/v1/admin/rbac/roles/:role
 * @desc    Get role details with permissions
 * @access  All authenticated admins
 */
router.get('/roles/:role', rbacController.getRoleDetails);

/**
 * @route   GET /api/v1/admin/rbac/matrix
 * @desc    Get permission matrix (permissions x roles)
 * @access  All authenticated admins
 */
router.get('/matrix', rbacController.getPermissionMatrix);

// ============================================================================
// Role Permission Management (SUPER_OWNER only)
// ============================================================================

/**
 * @route   POST /api/v1/admin/rbac/roles/:role/permissions
 * @desc    Assign permission to role
 * @access  SUPER_OWNER only
 */
router.post(
  '/roles/:role/permissions',
  requireMfaVerified,
  rbacController.assignRolePermission
);

/**
 * @route   DELETE /api/v1/admin/rbac/roles/:role/permissions/:permissionCode
 * @desc    Remove permission from role
 * @access  SUPER_OWNER only
 */
router.delete(
  '/roles/:role/permissions/:permissionCode',
  requireMfaVerified,
  rbacController.removeRolePermission
);

// ============================================================================
// Current Admin Permission Routes
// ============================================================================

/**
 * @route   GET /api/v1/admin/rbac/my-permissions
 * @desc    Get current admin's permission summary
 * @access  All authenticated admins
 */
router.get('/my-permissions', rbacController.getMyPermissions);

/**
 * @route   POST /api/v1/admin/rbac/check
 * @desc    Check if current admin has a permission
 * @access  All authenticated admins
 */
router.post('/check', rbacController.checkPermission);

/**
 * @route   POST /api/v1/admin/rbac/check/bulk
 * @desc    Check multiple permissions
 * @access  All authenticated admins
 */
router.post('/check/bulk', rbacController.checkBulkPermissions);

// ============================================================================
// Admin Permission Management (SUPER_ADMIN+ only)
// ============================================================================

/**
 * @route   GET /api/v1/admin/rbac/admins/:adminId/permissions
 * @desc    Get admin's permission summary
 * @access  SUPER_ADMIN+ or own permissions
 */
router.get('/admins/:adminId/permissions', rbacController.getAdminPermissions);

/**
 * @route   POST /api/v1/admin/rbac/admins/:adminId/permissions/grant
 * @desc    Grant custom permission to admin
 * @access  SUPER_ADMIN+ with MFA
 */
router.post(
  '/admins/:adminId/permissions/grant',
  requireAdminRole('SUPER_ADMIN'),
  requireMfaVerified,
  rbacController.grantPermission
);

/**
 * @route   POST /api/v1/admin/rbac/admins/:adminId/permissions/revoke
 * @desc    Revoke custom permission from admin
 * @access  SUPER_ADMIN+ with MFA
 */
router.post(
  '/admins/:adminId/permissions/revoke',
  requireAdminRole('SUPER_ADMIN'),
  requireMfaVerified,
  rbacController.revokePermission
);

/**
 * @route   PUT /api/v1/admin/rbac/admins/:adminId/permissions/bulk
 * @desc    Bulk update admin permissions
 * @access  SUPER_ADMIN+ with MFA
 */
router.put(
  '/admins/:adminId/permissions/bulk',
  requireAdminRole('SUPER_ADMIN'),
  requireMfaVerified,
  rbacController.bulkUpdatePermissions
);

/**
 * @route   PUT /api/v1/admin/rbac/admins/:adminId/role
 * @desc    Update admin's role
 * @access  SUPER_ADMIN+ with MFA (SUPER_OWNER for high roles)
 */
router.put(
  '/admins/:adminId/role',
  requireAdminRole('SUPER_ADMIN'),
  requireMfaVerified,
  rbacController.updateAdminRole
);

// ============================================================================
// Cache Management (SUPER_OWNER only)
// ============================================================================

/**
 * @route   POST /api/v1/admin/rbac/cache/clear
 * @desc    Clear permission cache
 * @access  SUPER_OWNER only
 */
router.post('/cache/clear', rbacController.clearCache);

export default router;
