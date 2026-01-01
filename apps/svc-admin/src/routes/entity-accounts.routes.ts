/**
 * Entity Accounts Routes
 * API routes for Business, Government, and NPO account management
 */

import { Router } from 'express';
import { entityAccountsController } from '../controllers/entity-accounts.controller';
import {
  authenticateAdminJWT,
  requirePermission,
} from '../middlewares/admin-auth.middleware';

const router = Router();

// ============================================
// Business Account Routes
// Permission: user:view:all (viewing organization/business data)
// ============================================

// List all business accounts
router.get(
  '/business-accounts',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.listBusinessAccounts
);

// Get single business account
router.get(
  '/business-accounts/:id',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getBusinessAccount
);

// Get business account dashboard
router.get(
  '/business-accounts/:id/dashboard',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getBusinessDashboard
);

// Get business sub-accounts
router.get(
  '/business-accounts/:id/sub-accounts',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getBusinessSubAccounts
);

// Get business employees
router.get(
  '/business-accounts/:id/employees',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getBusinessEmployees
);

// ============================================
// Government Account Routes
// Permission: user:view:all (viewing organization/government data)
// ============================================

// List all government accounts
router.get(
  '/government-accounts',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.listGovernmentAccounts
);

// Get single government account
router.get(
  '/government-accounts/:id',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getGovernmentAccount
);

// Get government account dashboard
router.get(
  '/government-accounts/:id/dashboard',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getGovernmentDashboard
);

// Get government signatories
router.get(
  '/government-accounts/:id/signatories',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getGovernmentSignatories
);

// Get government approvals
router.get(
  '/government-accounts/:id/approvals',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getGovernmentApprovals
);

// Get government sub-accounts
router.get(
  '/government-accounts/:id/sub-accounts',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getGovernmentSubAccounts
);

// ============================================
// NPO Account Routes
// Permission: user:view:all (viewing organization/NPO data)
// ============================================

// List all NPO accounts
router.get(
  '/npo-accounts',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.listNPOAccounts
);

// Get single NPO account
router.get(
  '/npo-accounts/:id',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getNPOAccount
);

// Get NPO account dashboard
router.get(
  '/npo-accounts/:id/dashboard',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getNPODashboard
);

// Get NPO signatories
router.get(
  '/npo-accounts/:id/signatories',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getNPOSignatories
);

// Get NPO programs
router.get(
  '/npo-accounts/:id/programs',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getNPOPrograms
);

// Get NPO donations
router.get(
  '/npo-accounts/:id/donations',
  authenticateAdminJWT,
  requirePermission('user:view:all'),
  entityAccountsController.getNPODonations
);

export default router;
