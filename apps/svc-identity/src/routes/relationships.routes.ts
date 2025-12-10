import { Router } from 'express';
import {
  getRelationships,
  createRelationship,
  getRelationshipDetail,
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
 *
 * ENTERPRISE FLOW:
 * 1. User creates relationship request (POST /)
 *    - If target exists: in-app notification sent
 *    - If target doesn't exist: invitation email queued
 * 2. Target user sees pending requests in their KYR page
 * 3. Target views details (GET /:id) in modal
 * 4. Target confirms (POST /:id/confirm) or rejects (POST /:id/reject)
 * 5. Rejection triggers 7-day cooldown before initiator can retry
 */

const router = Router();

// Apply authentication to all routes
router.use(authenticateJWT);

/**
 * GET /api/gxcoin/relationships
 * Get all relationships for the authenticated user
 * Returns: relationships, pendingInvites, trustScore
 */
router.get('/', getRelationships);

/**
 * POST /api/gxcoin/relationships
 * Create a new relationship invitation
 * Returns: relationship, userExists, invitationSent, message
 */
router.post('/', createRelationship);

/**
 * GET /api/gxcoin/relationships/trust-score
 * Get trust score for the authenticated user
 */
router.get('/trust-score', getTrustScore);

/**
 * GET /api/gxcoin/relationships/:relationshipId
 * Get detailed info about a relationship request (for approval modal)
 * Only accessible by the target user (invited person)
 */
router.get('/:relationshipId', getRelationshipDetail);

/**
 * POST /api/gxcoin/relationships/:relationshipId/confirm
 * Confirm a relationship invitation - awards trust points to both parties
 */
router.post('/:relationshipId/confirm', confirmRelationship);

/**
 * POST /api/gxcoin/relationships/:relationshipId/reject
 * Reject a relationship invitation - triggers 7-day cooldown
 */
router.post('/:relationshipId/reject', rejectRelationship);

export default router;
