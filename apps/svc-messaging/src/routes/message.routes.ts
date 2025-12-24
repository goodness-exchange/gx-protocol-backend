import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { messageRelayController } from '../controllers/message-relay.controller';

const router = Router();

/**
 * Message Routes - RELAY-ONLY MODE
 *
 * In relay mode:
 * - Messages are NOT stored on the server
 * - WebSocket is the primary transport for real-time messaging
 * - These REST endpoints are fallbacks/utilities
 * - All message history is stored on client devices (IndexedDB)
 */

/**
 * GET /api/v1/messages/info
 * Get information about relay-only mode (public)
 */
router.get('/info', messageRelayController.getInfo);

// All other routes require authentication
router.use(authenticateJWT);

/**
 * POST /api/v1/messages/conversations/:conversationId
 * Prepare a message for relay (REST fallback)
 *
 * Note: This generates a message DTO but does NOT store or broadcast it.
 * Use WebSocket for real-time delivery.
 */
router.post('/conversations/:conversationId', messageRelayController.relay);

/**
 * POST /api/v1/messages/conversations/:conversationId/read
 * Mark conversation as read
 */
router.post('/conversations/:conversationId/read', messageRelayController.markConversationAsRead);

/**
 * GET /api/v1/messages/unread/count
 * Get total unread count across all conversations
 */
router.get('/unread/count', messageRelayController.getUnreadCount);

/**
 * REMOVED ENDPOINTS (relay-only mode):
 *
 * - GET /conversations/:conversationId - Messages stored on client
 * - GET /:messageId - Messages stored on client
 * - PUT /:messageId - Edit via WebSocket only
 * - DELETE /:messageId - Delete via WebSocket only
 * - POST /:messageId/read - Use conversation-level read instead
 */

export default router;
