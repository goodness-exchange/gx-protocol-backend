import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { keyController } from '../controllers/key.controller';

const router = Router();

// All routes require authentication
router.use(authenticateJWT);

/**
 * POST /api/v1/keys/register
 * Register user's encryption key bundle
 */
router.post('/register', keyController.registerKeys);

/**
 * GET /api/v1/keys/bundle/:profileId
 * Get user's pre-key bundle for establishing session
 */
router.get('/bundle/:profileId', keyController.getKeyBundle);

/**
 * POST /api/v1/keys/prekeys
 * Upload new one-time pre-keys
 */
router.post('/prekeys', keyController.uploadPreKeys);

/**
 * GET /api/v1/keys/prekeys/count
 * Get count of remaining pre-keys
 */
router.get('/prekeys/count', keyController.getPreKeyCount);

/**
 * POST /api/v1/keys/rotate/signed
 * Rotate signed pre-key
 */
router.post('/rotate/signed', keyController.rotateSignedPreKey);

/**
 * GET /api/v1/keys/group/:conversationId
 * Get group encryption key
 */
router.get('/group/:conversationId', keyController.getGroupKey);

/**
 * POST /api/v1/keys/group/:conversationId/rotate
 * Rotate group encryption key
 */
router.post('/group/:conversationId/rotate', keyController.rotateGroupKey);

export default router;
