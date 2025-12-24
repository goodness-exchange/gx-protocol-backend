import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { conversationService } from '../services/conversation.service';
import { CreateConversationDTO, UpdateConversationDTO, AddParticipantsDTO, ConversationType } from '../types/dtos';

class ConversationController {
  /**
   * Create a new conversation
   * Default type is DIRECT if not specified
   */
  create = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const body = req.body as Partial<CreateConversationDTO>;
      const userId = req.user!.profileId;

      // Default to DIRECT conversation type if not specified
      const dto: CreateConversationDTO = {
        type: body.type || ConversationType.DIRECT,
        participantIds: body.participantIds || [],
        name: body.name,
        linkedTransactionId: body.linkedTransactionId,
      };

      const conversation = await conversationService.create(userId, dto);

      res.status(201).json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create conversation');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create conversation',
      });
    }
  };

  /**
   * List user's conversations
   */
  list = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.profileId;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await conversationService.list(userId, { limit, offset });

      res.status(200).json({
        success: true,
        data: result.conversations,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list conversations');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list conversations',
      });
    }
  };

  /**
   * Get conversation by ID
   */
  getById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.profileId;

      const conversation = await conversationService.getById(conversationId, userId);

      if (!conversation) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Conversation not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get conversation');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get conversation',
      });
    }
  };

  /**
   * Update conversation
   */
  update = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.profileId;
      const body = req.body as UpdateConversationDTO;

      const conversation = await conversationService.update(conversationId, userId, body);

      res.status(200).json({
        success: true,
        data: conversation,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to update conversation');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update conversation',
      });
    }
  };

  /**
   * Delete/archive conversation
   */
  delete = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.profileId;

      await conversationService.delete(conversationId, userId);

      res.status(200).json({
        success: true,
        message: 'Conversation deleted',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to delete conversation');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete conversation',
      });
    }
  };

  /**
   * Add participants to group conversation
   */
  addParticipants = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.profileId;
      const body = req.body as AddParticipantsDTO;

      await conversationService.addParticipants(conversationId, userId, body.profileIds);

      res.status(200).json({
        success: true,
        message: 'Participants added',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to add participants');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to add participants',
      });
    }
  };

  /**
   * Remove participant from group conversation
   */
  removeParticipant = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId, profileId } = req.params;
      const userId = req.user!.profileId;

      await conversationService.removeParticipant(conversationId, userId, profileId);

      res.status(200).json({
        success: true,
        message: 'Participant removed',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to remove participant');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to remove participant',
      });
    }
  };

  /**
   * Mute conversation
   */
  mute = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.profileId;
      const { duration } = req.body;

      await conversationService.mute(conversationId, userId, duration);

      res.status(200).json({
        success: true,
        message: 'Conversation muted',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to mute conversation');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to mute conversation',
      });
    }
  };

  /**
   * Unmute conversation
   */
  unmute = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.profileId;

      await conversationService.unmute(conversationId, userId);

      res.status(200).json({
        success: true,
        message: 'Conversation unmuted',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to unmute conversation');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to unmute conversation',
      });
    }
  };
}

export const conversationController = new ConversationController();
