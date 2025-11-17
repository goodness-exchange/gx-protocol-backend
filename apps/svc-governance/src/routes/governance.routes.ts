import { Router } from 'express';
import { governanceController } from '../controllers/governance.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { requireAdmin } from '@gx/core-http';

const router = Router();

// Submit proposal - any authenticated user can submit
router.post('/proposals', authenticateJWT, governanceController.submitProposal);

// Vote on proposal - any authenticated user can vote
router.post('/proposals/:proposalId/vote', authenticateJWT, governanceController.voteOnProposal);

// Execute proposal - requires ADMIN or SUPER_ADMIN role
router.post('/proposals/:proposalId/execute', authenticateJWT, requireAdmin, governanceController.executeProposal);
router.get('/proposals/:proposalId', governanceController.getProposal);
router.get('/proposals', governanceController.listActiveProposals);

export default router;
