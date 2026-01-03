import { Router } from 'express';
import { treasuryController } from '../controllers';
import { authenticateJWT, requireSuperAdmin } from '../middlewares';

const router = Router();

// Public routes (with JWT auth)
router.get('/country/:countryCode', authenticateJWT, treasuryController.getTreasuryByCountry);
router.get('/:treasuryId', authenticateJWT, treasuryController.getTreasuryById);
router.get('/', authenticateJWT, treasuryController.listTreasuries);

// Super Admin routes
router.post('/onboard', authenticateJWT, requireSuperAdmin, treasuryController.onboardTreasury);
router.put('/:treasuryId/status', authenticateJWT, requireSuperAdmin, treasuryController.updateTreasuryStatus);
router.post('/:treasuryId/activate', authenticateJWT, requireSuperAdmin, treasuryController.activateTreasury);

export default router;
