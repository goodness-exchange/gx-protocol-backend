import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { groupController } from '../controllers/group.controller';

const router = Router();

/**
 * Group Routes
 *
 * Endpoints for managing group conversations:
 * - Creation and settings
 * - Member management
 * - Role management
 * - Key distribution coordination
 */

// All routes require authentication
router.use(authenticateJWT);

/**
 * POST /api/v1/groups
 * Create a new group conversation
 */
router.post('/', groupController.create);

/**
 * GET /api/v1/groups/:conversationId
 * Get group details
 */
router.get('/:conversationId', groupController.getDetails);

/**
 * PUT /api/v1/groups/:conversationId
 * Update group settings
 */
router.put('/:conversationId', groupController.update);

/**
 * POST /api/v1/groups/:conversationId/leave
 * Leave the group
 */
router.post('/:conversationId/leave', groupController.leave);

/**
 * POST /api/v1/groups/:conversationId/participants
 * Add participants to group
 */
router.post('/:conversationId/participants', groupController.addParticipants);

/**
 * DELETE /api/v1/groups/:conversationId/participants/:profileId
 * Remove a participant from group
 */
router.delete('/:conversationId/participants/:profileId', groupController.removeParticipant);

/**
 * POST /api/v1/groups/:conversationId/participants/:profileId/promote
 * Promote a member to admin
 */
router.post('/:conversationId/participants/:profileId/promote', groupController.promote);

/**
 * POST /api/v1/groups/:conversationId/participants/:profileId/demote
 * Demote an admin to member
 */
router.post('/:conversationId/participants/:profileId/demote', groupController.demote);

/**
 * GET /api/v1/groups/:conversationId/key-recipients
 * Get list of participants for key distribution
 */
router.get('/:conversationId/key-recipients', groupController.getKeyRecipients);

/**
 * POST /api/v1/groups/:conversationId/key-rotation
 * Record a key rotation event
 */
router.post('/:conversationId/key-rotation', groupController.recordKeyRotation);

export default router;
