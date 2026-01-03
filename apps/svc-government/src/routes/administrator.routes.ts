import { Router } from 'express';
import { administratorController } from '../controllers';
import { authenticateJWT, requireTreasuryAdmin } from '../middlewares';

const router = Router();

// Get current user's assignments (no treasury context needed)
router.get('/me', authenticateJWT, administratorController.getMyAssignments);

// Get administrator by ID
router.get('/:adminId', authenticateJWT, administratorController.getAdministratorById);

// Treasury-scoped routes
router.get(
  '/treasury/:treasuryId',
  authenticateJWT,
  requireTreasuryAdmin(),
  administratorController.listAdministrators
);

router.get(
  '/treasury/:treasuryId/permissions',
  authenticateJWT,
  administratorController.getMyPermissions
);

router.post(
  '/treasury/:treasuryId',
  authenticateJWT,
  requireTreasuryAdmin({ permission: 'canAssignAdministrators' }),
  administratorController.assignAdministrator
);

router.put(
  '/:adminId',
  authenticateJWT,
  administratorController.updateAdministrator
);

router.delete(
  '/:adminId',
  authenticateJWT,
  administratorController.removeAdministrator
);

export default router;
