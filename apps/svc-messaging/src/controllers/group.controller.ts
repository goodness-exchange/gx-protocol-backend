import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { groupService } from '../services/group.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

/**
 * Group Controller
 *
 * Handles group conversation management including:
 * - Group creation
 * - Member management (add/remove/promote/demote)
 * - Group settings
 * - Key rotation notifications
 */
class GroupController {
  /**
   * POST /api/v1/groups
   * Create a new group conversation
   */
  async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { name, participantIds, linkedTransactionId } = req.body;

      if (!name || !participantIds || !Array.isArray(participantIds)) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: name, participantIds (array)',
        });
        return;
      }

      const group = await groupService.createGroup({
        creatorProfileId: userId,
        name,
        participantIds,
        linkedTransactionId,
      });

      res.status(201).json({
        success: true,
        data: group,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to create group');
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/v1/groups/:conversationId
   * Get group details
   */
  async getDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const details = await groupService.getGroupDetails(conversationId, userId);

      res.json({
        success: true,
        data: details,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get group details');
      res.status(404).json({ success: false, error: error.message });
    }
  }

  /**
   * PUT /api/v1/groups/:conversationId
   * Update group settings (name)
   */
  async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { name } = req.body;

      if (name) {
        await groupService.updateGroupName(conversationId, userId, name);
      }

      res.json({
        success: true,
        data: { conversationId, name },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to update group');
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/v1/groups/:conversationId/participants
   * Add participants to group
   */
  async addParticipants(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { profileIds } = req.body;

      if (!profileIds || !Array.isArray(profileIds)) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: profileIds (array)',
        });
        return;
      }

      const result = await groupService.addParticipants(conversationId, userId, profileIds);

      res.json({
        success: true,
        data: result,
        meta: {
          note: result.keyRotationRequired
            ? 'Key rotation required. All clients should rotate the group key.'
            : undefined,
        },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to add participants');
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * DELETE /api/v1/groups/:conversationId/participants/:profileId
   * Remove a participant from group
   */
  async removeParticipant(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId, profileId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const result = await groupService.removeParticipant(conversationId, userId, profileId);

      res.json({
        success: true,
        data: result,
        meta: {
          note: result.keyRotationRequired
            ? 'Key rotation required. All clients should rotate the group key.'
            : undefined,
        },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to remove participant');
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/v1/groups/:conversationId/leave
   * Leave the group
   */
  async leave(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const result = await groupService.leaveGroup(conversationId, userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to leave group');
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/v1/groups/:conversationId/participants/:profileId/promote
   * Promote a member to admin
   */
  async promote(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId, profileId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      await groupService.promoteToAdmin(conversationId, userId, profileId);

      res.json({
        success: true,
        data: { profileId, role: 'ADMIN' },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to promote participant');
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/v1/groups/:conversationId/participants/:profileId/demote
   * Demote an admin to member
   */
  async demote(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId, profileId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      await groupService.demoteToMember(conversationId, userId, profileId);

      res.json({
        success: true,
        data: { profileId, role: 'MEMBER' },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to demote participant');
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/v1/groups/:conversationId/key-recipients
   * Get list of participants who need the current group key
   */
  async getKeyRecipients(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const recipients = await groupService.getKeyRecipients(conversationId);

      res.json({
        success: true,
        data: { recipients },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get key recipients');
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/v1/groups/:conversationId/key-rotation
   * Record a key rotation event
   */
  async recordKeyRotation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { keyVersion } = req.body;

      if (typeof keyVersion !== 'number') {
        res.status(400).json({
          success: false,
          error: 'Missing required field: keyVersion (number)',
        });
        return;
      }

      await groupService.recordKeyRotation(conversationId, userId, keyVersion);

      res.json({
        success: true,
        data: { conversationId, keyVersion, rotatedAt: new Date().toISOString() },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to record key rotation');
      res.status(400).json({ success: false, error: error.message });
    }
  }
}

export const groupController = new GroupController();
