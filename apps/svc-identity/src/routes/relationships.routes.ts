import { Router } from 'express';
import {
  getRelationships,
  createRelationship,
  confirmRelationship,
  rejectRelationship,
  getTrustScore
} from '../controllers/relationships.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Relationships Routes (KYR - Know Your Relationship)
 *
 * All routes require JWT authentication.
 *
 * Base path: /api/gxcoin/relationships
 */

const router = Router();

// Apply authentication to all routes
router.use(authenticateJWT);

/**
 * GET /api/gxcoin/relationships
 * Get all relationships for the authenticated user
 */
router.get('/', getRelationships);

/**
 * POST /api/gxcoin/relationships
 * Create a new relationship invitation
 */
router.post('/', createRelationship);

/**
 * GET /api/gxcoin/relationships/trust-score
 * Get trust score for the authenticated user
 */
router.get('/trust-score', getTrustScore);

/**
 * POST /api/gxcoin/relationships/:relationshipId/confirm
 * Confirm a relationship invitation
 */
router.post('/:relationshipId/confirm', confirmRelationship);

/**
 * POST /api/gxcoin/relationships/:relationshipId/reject
 * Reject a relationship invitation
 */
router.post('/:relationshipId/reject', rejectRelationship);

export default router;
