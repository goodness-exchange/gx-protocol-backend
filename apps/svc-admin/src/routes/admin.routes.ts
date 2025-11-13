import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.post('/bootstrap', authenticateJWT, adminController.bootstrapSystem);
router.post('/countries/initialize', authenticateJWT, adminController.initializeCountryData);
router.post('/parameters', authenticateJWT, adminController.updateSystemParameter);
router.post('/system/pause', authenticateJWT, adminController.pauseSystem);
router.post('/system/resume', authenticateJWT, adminController.resumeSystem);
router.post('/admins', authenticateJWT, adminController.appointAdmin);
router.post('/treasury/activate', authenticateJWT, adminController.activateTreasury);

router.get('/system/status', adminController.getSystemStatus);
router.get('/parameters/:paramId', adminController.getSystemParameter);
router.get('/countries/:countryCode/stats', adminController.getCountryStats);
router.get('/countries', adminController.listAllCountries);
router.get('/counters', adminController.getGlobalCounters);

export default router;
