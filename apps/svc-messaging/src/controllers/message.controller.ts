import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { messageService } from '../services/message.service';
import { SendMessageDTO } from '../types/dtos';

class MessageController {
  /**
   * List messages for a conversation
   */
  listByConversation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.profileId;
      const limit = parseInt(req.query.limit as string) || 50;
      const cursor = req.query.cursor as string | undefined;

      const result = await messageService.listByConversation(conversationId, userId, { limit, cursor });

      res.status(200).json({
        success: true,
        data: result.messages,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list messages');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list messages',
      });
    }
  };

  /**
   * Send a message (REST fallback)
   */
  send = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.profileId;
      const body = req.body as SendMessageDTO;

      const message = await messageService.createMessage({
        conversationId,
        senderProfileId: userId,
        type: body.type,
        encryptedContent: body.encryptedContent,
        contentNonce: body.contentNonce,
        encryptionKeyId: body.encryptionKeyId,
        replyToMessageId: body.replyToMessageId,
        linkedTransactionId: body.linkedTransactionId,
      });

      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send message');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to send message',
      });
    }
  };

  /**
   * Get message by ID
   */
  getById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { messageId } = req.params;
      const userId = req.user!.profileId;

      const message = await messageService.getById(messageId, userId);

      if (!message) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Message not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: message,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get message');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get message',
      });
    }
  };

  /**
   * Edit a message
   */
  edit = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { messageId } = req.params;
      const userId = req.user!.profileId;
      const { encryptedContent, contentNonce } = req.body;

      const message = await messageService.editMessage(messageId, userId, {
        encryptedContent,
        contentNonce,
      });

      res.status(200).json({
        success: true,
        data: message,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to edit message');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to edit message',
      });
    }
  };

  /**
   * Delete a message
   */
  delete = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { messageId } = req.params;
      const userId = req.user!.profileId;

      await messageService.deleteMessage(messageId, userId);

      res.status(200).json({
        success: true,
        message: 'Message deleted',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to delete message');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete message',
      });
    }
  };

  /**
   * Mark message as read
   */
  markAsRead = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { messageId } = req.params;
      const userId = req.user!.profileId;

      await messageService.markAsRead(messageId, userId);

      res.status(200).json({
        success: true,
        message: 'Message marked as read',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to mark message as read');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to mark message as read',
      });
    }
  };

  /**
   * Get unread message count
   */
  getUnreadCount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.profileId;

      const count = await messageService.getUnreadCount(userId);

      res.status(200).json({
        success: true,
        data: { unreadCount: count },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get unread count');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get unread count',
      });
    }
  };
}

export const messageController = new MessageController();
