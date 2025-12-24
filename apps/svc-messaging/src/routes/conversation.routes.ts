import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { conversationController } from '../controllers/conversation.controller';

const router = Router();

// All routes require authentication
router.use(authenticateJWT);

/**
 * POST /api/v1/conversations
 * Create a new conversation (direct or group)
 */
router.post('/', conversationController.create);

/**
 * GET /api/v1/conversations
 * List user's conversations
 */
router.get('/', conversationController.list);

/**
 * GET /api/v1/conversations/:conversationId
 * Get conversation details
 */
router.get('/:conversationId', conversationController.getById);

/**
 * PUT /api/v1/conversations/:conversationId
 * Update conversation (name, etc.)
 */
router.put('/:conversationId', conversationController.update);

/**
 * DELETE /api/v1/conversations/:conversationId
 * Archive/delete conversation
 */
router.delete('/:conversationId', conversationController.delete);

/**
 * POST /api/v1/conversations/:conversationId/participants
 * Add participants to group conversation
 */
router.post('/:conversationId/participants', conversationController.addParticipants);

/**
 * DELETE /api/v1/conversations/:conversationId/participants/:profileId
 * Remove participant from group conversation
 */
router.delete('/:conversationId/participants/:profileId', conversationController.removeParticipant);

/**
 * POST /api/v1/conversations/:conversationId/mute
 * Mute conversation notifications
 */
router.post('/:conversationId/mute', conversationController.mute);

/**
 * POST /api/v1/conversations/:conversationId/unmute
 * Unmute conversation notifications
 */
router.post('/:conversationId/unmute', conversationController.unmute);

export default router;
