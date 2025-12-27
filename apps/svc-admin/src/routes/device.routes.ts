import { Router } from 'express';
import { sessionController } from '../controllers/session.controller';
import { authenticateAdminJWT, requirePermission } from '../middlewares/admin-auth.middleware';

const router = Router();

// ============================================================================
// Device Management Routes
// ============================================================================

// Query all devices with filters
router.get(
  '/',
  authenticateAdminJWT,
  requirePermission('device:view:all'),
  sessionController.queryDevices
);

// Get devices for a specific user
router.get(
  '/users/:profileId',
  authenticateAdminJWT,
  requirePermission('device:view:all'),
  sessionController.getUserDevices
);

// Update device trust status
router.patch(
  '/:deviceId/trust',
  authenticateAdminJWT,
  requirePermission('device:update:all'),
  sessionController.updateDeviceTrust
);

// Remove a device
router.delete(
  '/:deviceId',
  authenticateAdminJWT,
  requirePermission('device:delete:all'),
  sessionController.removeDevice
);

export default router;
