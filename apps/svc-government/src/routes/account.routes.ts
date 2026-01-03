import { Router } from 'express';
import { accountController } from '../controllers';
import { authenticateJWT, requireTreasuryAdmin } from '../middlewares';

const router = Router();

// Get account by ID (need to be authenticated)
router.get('/:accountId', authenticateJWT, accountController.getAccountById);

// Treasury-scoped routes
router.get(
  '/treasury/:treasuryId',
  authenticateJWT,
  requireTreasuryAdmin(),
  accountController.listAccounts
);

router.get(
  '/treasury/:treasuryId/hierarchy',
  authenticateJWT,
  requireTreasuryAdmin(),
  accountController.getAccountHierarchy
);

router.post(
  '/treasury/:treasuryId',
  authenticateJWT,
  requireTreasuryAdmin({ permission: 'canCreateStructure' }),
  accountController.createAccount
);

router.put(
  '/:accountId',
  authenticateJWT,
  accountController.updateAccount
);

router.delete(
  '/:accountId',
  authenticateJWT,
  accountController.archiveAccount
);

export default router;
