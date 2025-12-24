import { Request, Response } from 'express';
import { logger } from '@gx/core-logger';
import { messageRelayService } from '../services/message-relay.service';
import { MessageType } from '../types/dtos';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

/**
 * Message Relay Controller
 *
 * RELAY-ONLY MODE:
 * - Messages are NOT stored on the server
 * - REST endpoints provide fallback for WebSocket failures
 * - All message history is on client devices
 */
class MessageRelayController {
  /**
   * POST /api/v1/messages/conversations/:conversationId
   * Send/relay a message (REST fallback for WebSocket)
   *
   * In relay mode, this endpoint:
   * 1. Validates the sender is a participant
   * 2. Returns the message DTO with generated messageId
   * 3. Does NOT store the message
   *
   * The client is responsible for:
   * - Storing the message locally
   * - Handling delivery via WebSocket
   */
  async relay(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const {
        type,
        encryptedContent,
        contentNonce,
        encryptionKeyId,
        replyToMessageId,
        linkedTransactionId,
        clientMessageId,
      } = req.body;

      // Validate required fields
      if (!encryptedContent || !contentNonce || !encryptionKeyId) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: encryptedContent, contentNonce, encryptionKeyId',
        });
        return;
      }

      // Validate user is participant
      const isParticipant = await messageRelayService.isParticipant(conversationId, userId);
      if (!isParticipant) {
        res.status(403).json({
          success: false,
          error: 'Not a participant in this conversation',
        });
        return;
      }

      // Prepare message for relay
      const message = await messageRelayService.prepareForRelay({
        conversationId,
        senderProfileId: userId,
        type: type || MessageType.TEXT,
        encryptedContent,
        contentNonce,
        encryptionKeyId,
        replyToMessageId,
        linkedTransactionId,
      });

      // Note: In REST mode, the message is returned but NOT broadcast
      // Client should use WebSocket for real-time delivery
      // REST is only a fallback for generating the message DTO

      logger.info(
        { messageId: message.messageId, conversationId, via: 'REST' },
        'Message prepared for relay via REST'
      );

      res.status(201).json({
        success: true,
        data: message,
        meta: {
          clientMessageId,
          note: 'Message prepared. Use WebSocket for real-time delivery to other participants.',
        },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to prepare message for relay');
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }

  /**
   * POST /api/v1/messages/conversations/:conversationId/read
   * Mark conversation as read (not individual messages)
   */
  async markConversationAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      await messageRelayService.markConversationAsRead(conversationId, userId);

      res.json({
        success: true,
        data: {
          conversationId,
          readAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to mark conversation as read');
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }

  /**
   * GET /api/v1/messages/unread/count
   * Get total unread count across all conversations
   */
  async getUnreadCount(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const count = await messageRelayService.getUnreadCount(userId);

      res.json({
        success: true,
        data: { unreadCount: count },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get unread count');
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  }

  /**
   * GET /api/v1/messages/info
   * Return information about relay-only mode
   */
  getInfo = async (_req: Request, res: Response): Promise<void> => {
    res.json({
      success: true,
      data: {
        mode: 'relay-only',
        description: 'Messages are relayed in real-time via WebSocket. Message history is stored on client devices.',
        features: {
          serverStorage: false,
          e2eEncryption: true,
          offlineQueue: true,
          offlineQueueTTL: '7 days',
          voiceMessages: true,
          voiceStorageTTL: '24 hours',
        },
        endpoints: {
          relay: 'POST /api/v1/messages/conversations/:conversationId',
          markRead: 'POST /api/v1/messages/conversations/:conversationId/read',
          unreadCount: 'GET /api/v1/messages/unread/count',
        },
        websocket: {
          events: [
            'message:send',
            'message:received',
            'message:delivered',
            'message:read',
            'pending:messages',
          ],
        },
      },
    });
  };
}

export const messageRelayController = new MessageRelayController();
