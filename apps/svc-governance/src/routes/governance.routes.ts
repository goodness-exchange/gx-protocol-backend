import { Router } from 'express';
import { governanceController } from '../controllers/governance.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.post('/proposals', authenticateJWT, governanceController.submitProposal);
router.post('/proposals/:proposalId/vote', authenticateJWT, governanceController.voteOnProposal);
router.post('/proposals/:proposalId/execute', authenticateJWT, governanceController.executeProposal);
router.get('/proposals/:proposalId', governanceController.getProposal);
router.get('/proposals', governanceController.listActiveProposals);

export default router;
