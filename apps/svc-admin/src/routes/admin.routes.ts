import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { userManagementController } from '../controllers/user-management.controller';
// TEMPORARY: Commented out for testing - RE-ENABLE FOR PRODUCTION!
// import { authenticateJWT } from '../middlewares/auth.middleware';
// import { requireAdmin, requireSuperAdmin } from '@gx/core-http';

const router = Router();

// All admin operations require SUPER_ADMIN role
// TEMPORARY: Authentication disabled for testing - RE-ENABLE FOR PRODUCTION!
router.post('/bootstrap', /* authenticateJWT, requireSuperAdmin, */ adminController.bootstrapSystem);
router.post('/countries/initialize', /* authenticateJWT, requireSuperAdmin, */ adminController.initializeCountryData);
router.post('/parameters', /* authenticateJWT, requireSuperAdmin, */ adminController.updateSystemParameter);
router.post('/system/pause', /* authenticateJWT, requireSuperAdmin, */ adminController.pauseSystem);
router.post('/system/resume', /* authenticateJWT, requireSuperAdmin, */ adminController.resumeSystem);
router.post('/admins', /* authenticateJWT, requireSuperAdmin, */ adminController.appointAdmin);
router.post('/treasury/activate', /* authenticateJWT, requireSuperAdmin, */ adminController.activateTreasury);

router.get('/system/status', adminController.getSystemStatus);
router.get('/parameters/:paramId', adminController.getSystemParameter);
router.get('/countries/:countryCode/stats', adminController.getCountryStats);
router.get('/countries', adminController.listAllCountries);
router.get('/counters', adminController.getGlobalCounters);

// User Management Routes
// TEMPORARY: Authentication disabled for testing - RE-ENABLE FOR PRODUCTION!
router.get('/users', /* authenticateJWT, requireAdmin, */ userManagementController.listUsers);
router.get('/users/pending-onchain', /* authenticateJWT, requireSuperAdmin, */ userManagementController.getPendingOnchainUsers);
router.get('/users/frozen', /* authenticateJWT, requireAdmin, */ userManagementController.listFrozenUsers);
router.get('/users/:userId', /* authenticateJWT, requireAdmin, */ userManagementController.getUserDetails);
router.post('/users/:userId/approve', /* authenticateJWT, requireAdmin, */ userManagementController.approveUser);
router.post('/users/:userId/deny', /* authenticateJWT, requireAdmin, */ userManagementController.denyUser);
router.post('/users/batch-register-onchain', /* authenticateJWT, requireSuperAdmin, */ userManagementController.batchRegisterOnchain);
router.post('/users/:userId/freeze', /* authenticateJWT, requireSuperAdmin, */ userManagementController.freezeUser);
router.post('/users/:userId/unfreeze', /* authenticateJWT, requireSuperAdmin, */ userManagementController.unfreezeUser);

export default router;
