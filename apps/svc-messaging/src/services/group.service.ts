import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { v4 as uuidv4 } from 'uuid';
import {
  ConversationType,
  ParticipantRole,
} from '../types/dtos';
import { messagingConfig } from '../config';

interface CreateGroupParams {
  creatorProfileId: string;
  name: string;
  participantIds: string[];
  linkedTransactionId?: string;
}

/**
 * Group Service
 *
 * Handles group conversation creation, membership management,
 * and encryption key distribution for group chats.
 *
 * Key Distribution Model:
 * - Each group has a symmetric group key for message encryption
 * - The group key is encrypted individually for each participant
 * - Key rotation occurs when members join/leave
 */
class GroupService {
  /**
   * Create a new group conversation
   */
  async createGroup(params: CreateGroupParams): Promise<{
    conversationId: string;
    name: string;
    participants: { profileId: string; role: ParticipantRole }[];
  }> {
    // Validate participant count
    const allParticipants = [...new Set([params.creatorProfileId, ...params.participantIds])];

    if (allParticipants.length < 2) {
      throw new Error('Group must have at least 2 participants');
    }

    if (allParticipants.length > messagingConfig.maxGroupParticipants) {
      throw new Error(`Group cannot exceed ${messagingConfig.maxGroupParticipants} participants`);
    }

    const conversationId = uuidv4();

    // Create conversation with participants
    const conversation = await db.conversation.create({
      data: {
        conversationId,
        tenantId: 'default',
        type: ConversationType.GROUP,
        name: params.name,
        linkedTransactionId: params.linkedTransactionId,
        participants: {
          create: allParticipants.map((profileId) => ({
            tenantId: 'default',
            profileId,
            role: profileId === params.creatorProfileId
              ? ParticipantRole.OWNER
              : ParticipantRole.MEMBER,
          })),
        },
      },
      include: {
        participants: true,
      },
    });

    logger.info(
      { conversationId, creatorId: params.creatorProfileId, participantCount: allParticipants.length },
      'Group created'
    );

    return {
      conversationId: conversation.conversationId,
      name: conversation.name || 'Unnamed Group',
      participants: conversation.participants.map((p: any) => ({
        profileId: p.profileId,
        role: p.role,
      })),
    };
  }

  /**
   * Add participants to a group
   * Triggers key rotation for security
   */
  async addParticipants(
    conversationId: string,
    requesterId: string,
    newParticipantIds: string[]
  ): Promise<{ added: string[]; keyRotationRequired: boolean }> {
    // Verify requester has admin access
    await this.verifyAdminAccess(conversationId, requesterId);

    // Get current participant count
    const currentCount = await db.conversationParticipant.count({
      where: {
        conversationId,
        leftAt: null,
      },
    });

    if (currentCount + newParticipantIds.length > messagingConfig.maxGroupParticipants) {
      throw new Error(`Cannot exceed ${messagingConfig.maxGroupParticipants} participants`);
    }

    // Filter out existing participants
    const existingParticipants = await db.conversationParticipant.findMany({
      where: {
        conversationId,
        profileId: { in: newParticipantIds },
      },
    });

    const existingIds = new Set(existingParticipants.map((p: any) => p.profileId));
    const toAdd = newParticipantIds.filter((id) => !existingIds.has(id));

    if (toAdd.length === 0) {
      return { added: [], keyRotationRequired: false };
    }

    // Add new participants
    await db.conversationParticipant.createMany({
      data: toAdd.map((profileId) => ({
        tenantId: 'default',
        conversationId,
        profileId,
        role: ParticipantRole.MEMBER,
      })),
    });

    // Reactivate any previously left participants
    for (const existing of existingParticipants) {
      if (existing.leftAt) {
        await db.conversationParticipant.update({
          where: { participantId: existing.participantId },
          data: {
            leftAt: null,
            removedBy: null,
            role: ParticipantRole.MEMBER,
          },
        });
        toAdd.push(existing.profileId);
      }
    }

    logger.info(
      { conversationId, addedCount: toAdd.length, requesterId },
      'Participants added to group'
    );

    // Key rotation is required when new members join
    return { added: toAdd, keyRotationRequired: true };
  }

  /**
   * Remove a participant from a group
   * Triggers key rotation for security
   */
  async removeParticipant(
    conversationId: string,
    requesterId: string,
    targetProfileId: string
  ): Promise<{ removed: boolean; keyRotationRequired: boolean }> {
    // Can't remove yourself this way - use leaveGroup
    if (requesterId === targetProfileId) {
      throw new Error('Use leaveGroup to leave a group');
    }

    // Verify requester has admin access
    await this.verifyAdminAccess(conversationId, requesterId);

    // Check target exists and isn't the owner
    const target = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        profileId: targetProfileId,
        leftAt: null,
      },
    });

    if (!target) {
      throw new Error('Participant not found in group');
    }

    if (target.role === ParticipantRole.OWNER) {
      throw new Error('Cannot remove the group owner');
    }

    // Mark as removed
    await db.conversationParticipant.update({
      where: { participantId: target.participantId },
      data: {
        leftAt: new Date(),
        removedBy: requesterId,
      },
    });

    logger.info(
      { conversationId, targetProfileId, requesterId },
      'Participant removed from group'
    );

    // Key rotation required when members leave
    return { removed: true, keyRotationRequired: true };
  }

  /**
   * Leave a group voluntarily
   */
  async leaveGroup(
    conversationId: string,
    profileId: string
  ): Promise<{ left: boolean; newOwner?: string }> {
    const participant = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        profileId,
        leftAt: null,
      },
    });

    if (!participant) {
      throw new Error('Not a member of this group');
    }

    let newOwner: string | undefined;

    // If leaving owner, transfer ownership
    if (participant.role === ParticipantRole.OWNER) {
      // Find an admin, or any member to transfer to
      const newOwnerParticipant = await db.conversationParticipant.findFirst({
        where: {
          conversationId,
          profileId: { not: profileId },
          leftAt: null,
        },
        orderBy: [
          { role: 'asc' }, // ADMIN comes before MEMBER
          { joinedAt: 'asc' },
        ],
      });

      if (newOwnerParticipant) {
        await db.conversationParticipant.update({
          where: { participantId: newOwnerParticipant.participantId },
          data: { role: ParticipantRole.OWNER },
        });
        newOwner = newOwnerParticipant.profileId;
      } else {
        // Last person leaving - archive the group
        await db.conversation.update({
          where: { conversationId },
          data: { deletedAt: new Date() },
        });
      }
    }

    // Mark as left
    await db.conversationParticipant.update({
      where: { participantId: participant.participantId },
      data: { leftAt: new Date() },
    });

    logger.info(
      { conversationId, profileId, newOwner },
      'Participant left group'
    );

    return { left: true, newOwner };
  }

  /**
   * Promote a member to admin
   */
  async promoteToAdmin(
    conversationId: string,
    requesterId: string,
    targetProfileId: string
  ): Promise<void> {
    await this.verifyOwnerAccess(conversationId, requesterId);

    const target = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        profileId: targetProfileId,
        leftAt: null,
      },
    });

    if (!target) {
      throw new Error('Participant not found');
    }

    if (target.role === ParticipantRole.OWNER) {
      throw new Error('Cannot change owner role');
    }

    await db.conversationParticipant.update({
      where: { participantId: target.participantId },
      data: { role: ParticipantRole.ADMIN },
    });

    logger.info(
      { conversationId, targetProfileId, requesterId },
      'Participant promoted to admin'
    );
  }

  /**
   * Demote an admin to member
   */
  async demoteToMember(
    conversationId: string,
    requesterId: string,
    targetProfileId: string
  ): Promise<void> {
    await this.verifyOwnerAccess(conversationId, requesterId);

    const target = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        profileId: targetProfileId,
        role: ParticipantRole.ADMIN,
        leftAt: null,
      },
    });

    if (!target) {
      throw new Error('Admin not found');
    }

    await db.conversationParticipant.update({
      where: { participantId: target.participantId },
      data: { role: ParticipantRole.MEMBER },
    });

    logger.info(
      { conversationId, targetProfileId, requesterId },
      'Admin demoted to member'
    );
  }

  /**
   * Update group name
   */
  async updateGroupName(
    conversationId: string,
    requesterId: string,
    newName: string
  ): Promise<void> {
    await this.verifyAdminAccess(conversationId, requesterId);

    await db.conversation.update({
      where: { conversationId },
      data: { name: newName },
    });

    logger.info(
      { conversationId, newName, requesterId },
      'Group name updated'
    );
  }

  /**
   * Get group details
   */
  async getGroupDetails(conversationId: string, requesterId: string): Promise<{
    conversationId: string;
    name: string;
    type: ConversationType;
    participantCount: number;
    participants: {
      profileId: string;
      role: ParticipantRole;
      joinedAt: string;
    }[];
    createdAt: string;
  }> {
    // Verify requester is a participant
    const isParticipant = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        profileId: requesterId,
        leftAt: null,
      },
    });

    if (!isParticipant) {
      throw new Error('Not a participant in this group');
    }

    const conversation = await db.conversation.findUnique({
      where: { conversationId },
      include: {
        participants: {
          where: { leftAt: null },
          orderBy: [
            { role: 'asc' },
            { joinedAt: 'asc' },
          ],
        },
      },
    });

    if (!conversation) {
      throw new Error('Group not found');
    }

    return {
      conversationId: conversation.conversationId,
      name: conversation.name || 'Unnamed Group',
      type: conversation.type as ConversationType,
      participantCount: conversation.participants.length,
      participants: conversation.participants.map((p: any) => ({
        profileId: p.profileId,
        role: p.role,
        joinedAt: p.joinedAt.toISOString(),
      })),
      createdAt: conversation.createdAt.toISOString(),
    };
  }

  /**
   * Get participants who need the current group key
   * Used for key distribution after rotation
   */
  async getKeyRecipients(conversationId: string): Promise<string[]> {
    const participants = await db.conversationParticipant.findMany({
      where: {
        conversationId,
        leftAt: null,
      },
      select: { profileId: true },
    });

    return participants.map((p: { profileId: string }) => p.profileId);
  }

  /**
   * Record a key rotation event
   * Client generates and distributes keys; server tracks version
   */
  async recordKeyRotation(
    conversationId: string,
    initiatorProfileId: string,
    keyVersion: number
  ): Promise<void> {
    // Verify initiator has access
    await this.verifyAdminAccess(conversationId, initiatorProfileId);

    // Update conversation metadata to track current key version
    // Note: Actual key material is never stored on server
    await db.conversation.update({
      where: { conversationId },
      data: {
        // Store key version in a metadata field or separate table
        // For now, we'll just log it
      },
    });

    logger.info(
      { conversationId, initiatorProfileId, keyVersion },
      'Group key rotation recorded'
    );
  }

  /**
   * Verify user has admin (owner or admin) access
   */
  private async verifyAdminAccess(conversationId: string, profileId: string): Promise<void> {
    const participant = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        profileId,
        leftAt: null,
        role: { in: [ParticipantRole.OWNER, ParticipantRole.ADMIN] },
      },
    });

    if (!participant) {
      throw new Error('Insufficient permissions - admin access required');
    }
  }

  /**
   * Verify user is the group owner
   */
  private async verifyOwnerAccess(conversationId: string, profileId: string): Promise<void> {
    const participant = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        profileId,
        leftAt: null,
        role: ParticipantRole.OWNER,
      },
    });

    if (!participant) {
      throw new Error('Insufficient permissions - owner access required');
    }
  }
}

export const groupService = new GroupService();
