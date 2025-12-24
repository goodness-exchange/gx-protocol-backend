import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { v4 as uuidv4 } from 'uuid';
import {
  MessageDTO,
  MessageListDTO,
  MessageType,
  MessageStatus,
} from '../types/dtos';
import { messagingConfig } from '../config';
import { encryptionService } from './encryption.service';

interface CreateMessageParams {
  conversationId: string;
  senderProfileId: string;
  type: MessageType;
  encryptedContent: string;
  contentNonce: string;
  encryptionKeyId: string;
  replyToMessageId?: string;
  linkedTransactionId?: string;
  voiceDurationMs?: number;
  voiceStorageKey?: string;
}

class MessageService {
  /**
   * Create a new message
   */
  async createMessage(params: CreateMessageParams): Promise<MessageDTO> {
    logger.info(
      { conversationId: params.conversationId, type: params.type },
      'Creating message'
    );

    // Validate message size
    if (Buffer.byteLength(params.encryptedContent, 'utf8') > messagingConfig.maxMessageSizeBytes) {
      throw new Error('Message exceeds maximum size');
    }

    // Wrap content for master key escrow (compliance)
    let masterKeyWrappedContent: string | null = null;
    if (messagingConfig.masterKeyEnabled) {
      try {
        masterKeyWrappedContent = await encryptionService.wrapForMasterKey(params.encryptedContent);
      } catch (error) {
        logger.warn({ error }, 'Failed to wrap content for master key escrow');
      }
    }

    const message = await db.message.create({
      data: {
        messageId: uuidv4(),
        tenantId: 'default',
        conversationId: params.conversationId,
        senderProfileId: params.senderProfileId,
        type: params.type,
        encryptedContent: params.encryptedContent,
        contentNonce: params.contentNonce,
        encryptionKeyId: params.encryptionKeyId,
        replyToMessageId: params.replyToMessageId,
        linkedTransactionId: params.linkedTransactionId,
        voiceDurationMs: params.voiceDurationMs,
        voiceStorageKey: params.voiceStorageKey,
        status: MessageStatus.SENT,
        masterKeyWrappedContent,
      },
    });

    // Update conversation lastMessageAt
    await db.conversation.update({
      where: { conversationId: params.conversationId },
      data: { lastMessageAt: new Date() },
    });

    // Increment unread count for other participants
    await db.conversationParticipant.updateMany({
      where: {
        conversationId: params.conversationId,
        profileId: { not: params.senderProfileId },
        leftAt: null,
      },
      data: {
        unreadCount: { increment: 1 },
      },
    });

    // Create delivery receipts for all participants
    const participants = await db.conversationParticipant.findMany({
      where: {
        conversationId: params.conversationId,
        profileId: { not: params.senderProfileId },
        leftAt: null,
      },
    });

    await db.messageDeliveryReceipt.createMany({
      data: participants.map((p: any) => ({
        tenantId: 'default',
        messageId: message.messageId,
        recipientProfileId: p.profileId,
      })),
    });

    return this.toDTO(message);
  }

  /**
   * List messages for a conversation
   */
  async listByConversation(
    conversationId: string,
    _userId: string,
    options: { limit: number; cursor?: string }
  ): Promise<MessageListDTO> {
    const where: any = {
      conversationId,
      deletedAt: null,
    };

    if (options.cursor) {
      where.createdAt = { lt: new Date(options.cursor) };
    }

    const messages = await db.message.findMany({
      where,
      include: {
        deliveryReceipts: true,
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit + 1, // Fetch one extra to check hasMore
    });

    const hasMore = messages.length > options.limit;
    if (hasMore) {
      messages.pop();
    }

    return {
      messages: messages.map((m: any) => this.toDTO(m)),
      pagination: {
        limit: options.limit,
        cursor: messages.length > 0 ? messages[messages.length - 1].createdAt.toISOString() : null,
        hasMore,
      },
    };
  }

  /**
   * Get message by ID
   */
  async getById(messageId: string, userId: string): Promise<MessageDTO | null> {
    const message = await db.message.findFirst({
      where: {
        messageId,
        deletedAt: null,
        conversation: {
          participants: {
            some: {
              profileId: userId,
              leftAt: null,
            },
          },
        },
      },
      include: {
        deliveryReceipts: true,
      },
    });

    return message ? this.toDTO(message) : null;
  }

  /**
   * Edit a message
   */
  async editMessage(
    messageId: string,
    userId: string,
    data: { encryptedContent: string; contentNonce: string }
  ): Promise<MessageDTO> {
    const message = await db.message.findFirst({
      where: {
        messageId,
        senderProfileId: userId,
        deletedAt: null,
      },
    });

    if (!message) {
      throw new Error('Message not found or not owned by user');
    }

    const updated = await db.message.update({
      where: { messageId },
      data: {
        encryptedContent: data.encryptedContent,
        contentNonce: data.contentNonce,
        editedAt: new Date(),
      },
      include: {
        deliveryReceipts: true,
      },
    });

    return this.toDTO(updated);
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const message = await db.message.findFirst({
      where: {
        messageId,
        senderProfileId: userId,
        deletedAt: null,
      },
    });

    if (!message) {
      throw new Error('Message not found or not owned by user');
    }

    await db.message.update({
      where: { messageId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string, userId: string): Promise<void> {
    await db.messageDeliveryReceipt.updateMany({
      where: {
        messageId,
        recipientProfileId: userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    // Decrement unread count
    const message = await db.message.findUnique({
      where: { messageId },
    });

    if (message) {
      await db.conversationParticipant.updateMany({
        where: {
          conversationId: message.conversationId,
          profileId: userId,
          unreadCount: { gt: 0 },
        },
        data: {
          unreadCount: { decrement: 1 },
          lastReadAt: new Date(),
        },
      });
    }
  }

  /**
   * Get total unread message count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await db.conversationParticipant.aggregate({
      where: {
        profileId: userId,
        leftAt: null,
      },
      _sum: {
        unreadCount: true,
      },
    });

    return result._sum.unreadCount || 0;
  }

  /**
   * Convert database model to DTO
   */
  private toDTO(message: any): MessageDTO {
    return {
      messageId: message.messageId,
      conversationId: message.conversationId,
      senderProfileId: message.senderProfileId,
      senderDisplayName: message.senderProfileId, // TODO: Fetch from user profile
      senderAvatarUrl: null,
      type: message.type,
      encryptedContent: message.encryptedContent,
      contentNonce: message.contentNonce,
      encryptionKeyId: message.encryptionKeyId,
      voiceDurationMs: message.voiceDurationMs,
      voiceStorageKey: message.voiceStorageKey,
      // File attachment fields
      fileStorageKey: message.fileStorageKey || null,
      fileName: message.fileName || null,
      fileMimeType: message.fileMimeType || null,
      fileSizeBytes: message.fileSizeBytes || null,
      imageWidth: message.imageWidth || null,
      imageHeight: message.imageHeight || null,
      thumbnailStorageKey: message.thumbnailStorageKey || null,
      linkedTransactionId: message.linkedTransactionId,
      replyToMessageId: message.replyToMessageId,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString() || null,
      deliveryReceipts: (message.deliveryReceipts || []).map((r: any) => ({
        recipientProfileId: r.recipientProfileId,
        deliveredAt: r.deliveredAt?.toISOString() || null,
        readAt: r.readAt?.toISOString() || null,
      })),
    };
  }
}

export const messageService = new MessageService();
