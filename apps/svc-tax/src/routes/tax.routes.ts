import { Router } from 'express';
import { taxController } from '../controllers/tax.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { moderateRateLimiter } from '@gx/core-http';

const router = Router();

// Public endpoint - rate limit to prevent abuse
router.post('/fees/calculate', moderateRateLimiter, taxController.calculateFee);
router.post('/velocity-tax/apply', authenticateJWT, taxController.applyVelocityTax);
router.get('/velocity-tax/eligibility/:accountId', taxController.checkEligibility);

export default router;
