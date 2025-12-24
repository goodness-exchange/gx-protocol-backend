import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import {
  CreateConversationDTO,
  UpdateConversationDTO,
  ConversationDTO,
  ConversationListDTO,
  ConversationType,
  ParticipantRole,
} from '../types/dtos';

class ConversationService {
  /**
   * Create a new conversation
   */
  async create(userId: string, dto: CreateConversationDTO): Promise<ConversationDTO> {
    logger.info({ userId, type: dto.type }, 'Creating conversation');

    // Ensure creator is included in participants
    const participantIds = [...new Set([userId, ...dto.participantIds])];

    // For direct conversations, verify exactly 2 participants
    if (dto.type === ConversationType.DIRECT && participantIds.length !== 2) {
      throw new Error('Direct conversations must have exactly 2 participants');
    }

    // Check if direct conversation already exists
    if (dto.type === ConversationType.DIRECT) {
      const existing = await this.findDirectConversation(participantIds[0], participantIds[1]);
      if (existing) {
        return existing;
      }
    }

    const conversation = await db.conversation.create({
      data: {
        tenantId: 'default',
        type: dto.type,
        name: dto.name,
        linkedTransactionId: dto.linkedTransactionId,
        participants: {
          create: participantIds.map((profileId, _index) => ({
            tenantId: 'default',
            profileId,
            role: profileId === userId ? ParticipantRole.OWNER : ParticipantRole.MEMBER,
          })),
        },
      },
      include: {
        participants: true,
      },
    });

    return this.toDTO(conversation);
  }

  /**
   * Find existing direct conversation between two users
   */
  async findDirectConversation(userId1: string, userId2: string): Promise<ConversationDTO | null> {
    const conversation = await db.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        participants: {
          every: {
            profileId: { in: [userId1, userId2] },
          },
        },
      },
      include: {
        participants: true,
      },
    });

    return conversation ? this.toDTO(conversation) : null;
  }

  /**
   * List user's conversations
   */
  async list(userId: string, options: { limit: number; offset: number }): Promise<ConversationListDTO> {
    // RELAY-ONLY MODE: No message storage on server
    // Messages are stored on client devices
    const [conversations, total] = await Promise.all([
      db.conversation.findMany({
        where: {
          participants: {
            some: {
              profileId: userId,
              leftAt: null,
            },
          },
          deletedAt: null,
        },
        include: {
          participants: {
            where: { leftAt: null },
          },
          // Note: messages not included - stored on client
        },
        orderBy: { lastMessageAt: 'desc' },
        take: options.limit,
        skip: options.offset,
      }),
      db.conversation.count({
        where: {
          participants: {
            some: {
              profileId: userId,
              leftAt: null,
            },
          },
          deletedAt: null,
        },
      }),
    ]);

    return {
      conversations: conversations.map((c: any) => this.toDTO(c)),
      pagination: {
        limit: options.limit,
        offset: options.offset,
        hasMore: options.offset + conversations.length < total,
      },
    };
  }

  /**
   * Get conversation by ID
   */
  async getById(conversationId: string, userId: string): Promise<ConversationDTO | null> {
    const conversation = await db.conversation.findFirst({
      where: {
        conversationId,
        participants: {
          some: {
            profileId: userId,
            leftAt: null,
          },
        },
        deletedAt: null,
      },
      include: {
        participants: {
          where: { leftAt: null },
        },
      },
    });

    return conversation ? this.toDTO(conversation) : null;
  }

  /**
   * Check if user is participant in conversation
   */
  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const participant = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        profileId: userId,
        leftAt: null,
      },
    });

    return !!participant;
  }

  /**
   * Update conversation
   */
  async update(conversationId: string, userId: string, dto: UpdateConversationDTO): Promise<ConversationDTO> {
    // Verify user is owner or admin
    await this.verifyAdminAccess(conversationId, userId);

    const conversation = await db.conversation.update({
      where: { conversationId },
      data: {
        name: dto.name,
      },
      include: {
        participants: {
          where: { leftAt: null },
        },
      },
    });

    return this.toDTO(conversation);
  }

  /**
   * Delete/archive conversation
   */
  async delete(conversationId: string, userId: string): Promise<void> {
    await this.verifyAdminAccess(conversationId, userId);

    await db.conversation.update({
      where: { conversationId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Add participants to group conversation
   */
  async addParticipants(conversationId: string, userId: string, profileIds: string[]): Promise<void> {
    await this.verifyAdminAccess(conversationId, userId);

    const conversation = await db.conversation.findUnique({
      where: { conversationId },
    });

    if (conversation?.type !== ConversationType.GROUP) {
      throw new Error('Cannot add participants to direct conversation');
    }

    await db.conversationParticipant.createMany({
      data: profileIds.map((profileId) => ({
        tenantId: 'default',
        conversationId,
        profileId,
        role: ParticipantRole.MEMBER,
      })),
      skipDuplicates: true,
    });

    // TODO: Trigger group key rotation
  }

  /**
   * Remove participant from group conversation
   */
  async removeParticipant(conversationId: string, userId: string, profileId: string): Promise<void> {
    await this.verifyAdminAccess(conversationId, userId);

    await db.conversationParticipant.updateMany({
      where: {
        conversationId,
        profileId,
      },
      data: {
        leftAt: new Date(),
        removedBy: userId,
      },
    });

    // TODO: Trigger group key rotation
  }

  /**
   * Mute conversation
   */
  async mute(conversationId: string, userId: string, durationHours?: number): Promise<void> {
    const expiresAt = durationHours
      ? new Date(Date.now() + durationHours * 60 * 60 * 1000)
      : null;

    await db.conversationParticipant.updateMany({
      where: {
        conversationId,
        profileId: userId,
      },
      data: {
        isMuted: true,
        muteExpiresAt: expiresAt,
      },
    });
  }

  /**
   * Unmute conversation
   */
  async unmute(conversationId: string, userId: string): Promise<void> {
    await db.conversationParticipant.updateMany({
      where: {
        conversationId,
        profileId: userId,
      },
      data: {
        isMuted: false,
        muteExpiresAt: null,
      },
    });
  }

  /**
   * Verify user has admin access to conversation
   */
  private async verifyAdminAccess(conversationId: string, userId: string): Promise<void> {
    const participant = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        profileId: userId,
        leftAt: null,
        role: { in: [ParticipantRole.OWNER, ParticipantRole.ADMIN] },
      },
    });

    if (!participant) {
      throw new Error('Insufficient permissions');
    }
  }

  /**
   * Convert database model to DTO
   *
   * RELAY-ONLY MODE:
   * - lastMessage is not included (stored on client)
   * - Client maintains its own message history
   */
  private toDTO(conversation: any): ConversationDTO {
    const participant = conversation.participants?.[0];

    return {
      conversationId: conversation.conversationId,
      type: conversation.type,
      name: conversation.name,
      linkedTransactionId: conversation.linkedTransactionId,
      lastMessageAt: conversation.lastMessageAt?.toISOString() || null,
      createdAt: conversation.createdAt.toISOString(),
      unreadCount: participant?.unreadCount || 0,
      participants: (conversation.participants || []).map((p: any) => ({
        participantId: p.participantId,
        profileId: p.profileId,
        displayName: p.profileId, // TODO: Fetch from user profile
        avatarUrl: null,
        role: p.role,
        isOnline: false, // TODO: Check presence
        lastSeenAt: null,
      })),
      // Note: lastMessage not included in relay-only mode
      // Client stores message history locally
      lastMessage: undefined,
    };
  }
}

export const conversationService = new ConversationService();
