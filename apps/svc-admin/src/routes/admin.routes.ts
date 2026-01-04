import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { userManagementController } from '../controllers/user-management.controller';
import {
  authenticateAdminJWT,
  requirePermission,
  requireSuperOwner,
} from '../middlewares/admin-auth.middleware';

const router = Router();

// ============================================================================
// System Administration Routes
// These are high-privilege operations for system setup and control
// ============================================================================

// Bootstrap system - SUPER_OWNER only (one-time setup)
router.post(
  '/bootstrap',
  authenticateAdminJWT,
  requireSuperOwner,
  adminController.bootstrapSystem
);

// Initialize country data - requires config:country:manage
router.post(
  '/countries/initialize',
  authenticateAdminJWT,
  requirePermission('config:country:manage'),
  adminController.initializeCountryData
);

// Update system parameter - requires config:limit:set
router.post(
  '/parameters',
  authenticateAdminJWT,
  requirePermission('config:limit:set'),
  adminController.updateSystemParameter
);

// Pause system - requires system:pause:all (CRITICAL)
router.post(
  '/system/pause',
  authenticateAdminJWT,
  requirePermission('system:pause:all'),
  adminController.pauseSystem
);

// Resume system - requires system:resume:all
router.post(
  '/system/resume',
  authenticateAdminJWT,
  requirePermission('system:resume:all'),
  adminController.resumeSystem
);

// Activate treasury - SUPER_OWNER only
router.post(
  '/treasury/activate',
  authenticateAdminJWT,
  requireSuperOwner,
  adminController.activateTreasury
);

// ============================================================================
// Admin Management Routes
// ============================================================================

// List all admins - requires admin:view:all
router.get(
  '/admins',
  authenticateAdminJWT,
  requirePermission('admin:view:all'),
  adminController.listAdmins
);

// Get single admin - requires admin:view:all
router.get(
  '/admins/:adminId',
  authenticateAdminJWT,
  requirePermission('admin:view:all'),
  adminController.getAdmin
);

// Create new admin - requires admin:create:all
router.post(
  '/admins',
  authenticateAdminJWT,
  requirePermission('admin:create:all'),
  adminController.appointAdmin
);

// ============================================================================
// Read-Only System Routes (authenticated only)
// ============================================================================

// System status - requires system:health:view
router.get(
  '/system/status',
  authenticateAdminJWT,
  requirePermission('system:health:view'),
  adminController.getSystemStatus
);

// Get system parameter - requires system:health:view
router.get(
  '/parameters/:paramId',
  authenticateAdminJWT,
  requirePermission('system:health:view'),
  adminController.getSystemParameter
);

// Get country stats - requires user:view:all (user distribution data)
router.get(
  '/countries/:countryCode/stats',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  adminController.getCountryStats
);

// List all countries - requires config:country:manage or user:view:all
router.get(
  '/countries',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  adminController.listAllCountries
);

// Get global counters - requires report:view:dashboard
router.get(
  '/counters',
  authenticateAdminJWT,
  requirePermission('report:view:dashboard'),
  adminController.getGlobalCounters
);

// ============================================================================
// Supply Status Routes (Blockchain Query)
// These endpoints query the blockchain for supply and pool information
// ============================================================================

// Get supply status - requires report:view:dashboard
router.get(
  '/supply/status',
  authenticateAdminJWT,
  requirePermission('report:view:dashboard'),
  adminController.getSupplyStatus
);

// Get specific pool status - requires report:view:dashboard
router.get(
  '/supply/pools/:poolId',
  authenticateAdminJWT,
  requirePermission('report:view:dashboard'),
  adminController.getPoolStatus
);

// Get country allocations for supply management - requires report:view:dashboard
router.get(
  '/supply/countries',
  authenticateAdminJWT,
  requirePermission('report:view:dashboard'),
  adminController.getSupplyCountries
);

// ============================================================================
// User Management Routes
// ============================================================================

// List users - requires user:view:all
router.get(
  '/users',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  userManagementController.listUsers
);

// Get users pending on-chain registration - requires user:view:all
router.get(
  '/users/pending-onchain',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  userManagementController.getPendingOnchainUsers
);

// List frozen users - requires user:view:all
router.get(
  '/users/frozen',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  userManagementController.listFrozenUsers
);

// Get user details - requires user:view:all
router.get(
  '/users/:userId',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  userManagementController.getUserDetails
);

// Approve user - requires user:approve:all
router.post(
  '/users/:userId/approve',
  authenticateAdminJWT,
  requirePermission('user:approve:all'),
  userManagementController.approveUser
);

// Deny/Reject user - requires user:reject:all
router.post(
  '/users/:userId/deny',
  authenticateAdminJWT,
  requirePermission('user:reject:all'),
  userManagementController.denyUser
);

// Batch register users on-chain - requires user:approve:all
router.post(
  '/users/batch-register-onchain',
  authenticateAdminJWT,
  requirePermission('user:approve:all'),
  userManagementController.batchRegisterOnchain
);

// Freeze user - requires user:freeze:all (HIGH risk, MFA + Approval)
router.post(
  '/users/:userId/freeze',
  authenticateAdminJWT,
  requirePermission('user:freeze:all'),
  userManagementController.freezeUser
);

// Unfreeze user - requires user:unfreeze:all (HIGH risk, MFA + Approval)
router.post(
  '/users/:userId/unfreeze',
  authenticateAdminJWT,
  requirePermission('user:unfreeze:all'),
  userManagementController.unfreezeUser
);

export default router;
