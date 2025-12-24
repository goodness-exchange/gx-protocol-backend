import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { messageController } from '../controllers/message.controller';

const router = Router();

// All routes require authentication
router.use(authenticateJWT);

/**
 * GET /api/v1/messages/conversations/:conversationId
 * Get messages for a conversation (paginated)
 */
router.get('/conversations/:conversationId', messageController.listByConversation);

/**
 * POST /api/v1/messages/conversations/:conversationId
 * Send a message (REST fallback for non-WebSocket clients)
 */
router.post('/conversations/:conversationId', messageController.send);

/**
 * GET /api/v1/messages/:messageId
 * Get a specific message
 */
router.get('/:messageId', messageController.getById);

/**
 * PUT /api/v1/messages/:messageId
 * Edit a message
 */
router.put('/:messageId', messageController.edit);

/**
 * DELETE /api/v1/messages/:messageId
 * Delete a message
 */
router.delete('/:messageId', messageController.delete);

/**
 * POST /api/v1/messages/:messageId/read
 * Mark message as read
 */
router.post('/:messageId/read', messageController.markAsRead);

/**
 * GET /api/v1/messages/unread/count
 * Get total unread message count
 */
router.get('/unread/count', messageController.getUnreadCount);

export default router;
