import { Router } from 'express';
import { taxController } from '../controllers/tax.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.post('/fees/calculate', taxController.calculateFee);
router.post('/velocity-tax/apply', authenticateJWT, taxController.applyVelocityTax);
router.get('/velocity-tax/eligibility/:accountId', taxController.checkEligibility);

export default router;
