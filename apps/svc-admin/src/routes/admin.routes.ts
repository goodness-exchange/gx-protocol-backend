import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { requireSuperAdmin } from '@gx/core-http';

const router = Router();

// All admin operations require SUPER_ADMIN role
router.post('/bootstrap', authenticateJWT, requireSuperAdmin, adminController.bootstrapSystem);
router.post('/countries/initialize', authenticateJWT, requireSuperAdmin, adminController.initializeCountryData);
router.post('/parameters', authenticateJWT, requireSuperAdmin, adminController.updateSystemParameter);
router.post('/system/pause', authenticateJWT, requireSuperAdmin, adminController.pauseSystem);
router.post('/system/resume', authenticateJWT, requireSuperAdmin, adminController.resumeSystem);
router.post('/admins', authenticateJWT, requireSuperAdmin, adminController.appointAdmin);
router.post('/treasury/activate', authenticateJWT, requireSuperAdmin, adminController.activateTreasury);

router.get('/system/status', adminController.getSystemStatus);
router.get('/parameters/:paramId', adminController.getSystemParameter);
router.get('/countries/:countryCode/stats', adminController.getCountryStats);
router.get('/countries', adminController.listAllCountries);
router.get('/counters', adminController.getGlobalCounters);

export default router;
