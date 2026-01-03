import { Router } from 'express';
import { healthController } from '../controllers';

const router = Router();

router.get('/health', healthController.health);
router.get('/readyz', healthController.readiness);
router.get('/livez', healthController.liveness);

export default router;
