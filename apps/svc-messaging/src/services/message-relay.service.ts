import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  MessageDTO,
  MessageType,
  MessageStatus,
} from '../types/dtos';
import { messagingConfig } from '../config';

/**
 * Pending message for offline delivery
 */
interface PendingMessage {
  messageId: string;
  conversationId: string;
  senderProfileId: string;
  type: MessageType;
  encryptedContent: string;
  contentNonce: string;
  encryptionKeyId: string;
  replyToMessageId?: string | null;
  linkedTransactionId?: string | null;
  voiceDurationMs?: number | null;
  voiceStorageKey?: string | null;
  createdAt: string;
  expiresAt: string;
}

interface RelayMessageParams {
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

/**
 * Message Relay Service
 *
 * This service operates in RELAY-ONLY mode:
 * - Messages are NOT stored on the server
 * - Messages are relayed via WebSocket in real-time
 * - For offline users, messages are queued in Redis with TTL
 * - All message history is stored on client devices (IndexedDB)
 */
class MessageRelayService {
  private redis: Redis | null = null;
  private readonly MESSAGE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
  private readonly OFFLINE_QUEUE_PREFIX = 'msg:offline:';

  constructor() {
    this.initRedis();
  }

  private async initRedis(): Promise<void> {
    if (messagingConfig.redisUrl) {
      try {
        this.redis = new Redis(messagingConfig.redisUrl);
        this.redis.on('error', (err) => {
          logger.error({ error: err }, 'Redis connection error in MessageRelayService');
        });
        this.redis.on('connect', () => {
          logger.info('MessageRelayService connected to Redis');
        });
      } catch (error) {
        logger.warn({ error }, 'Failed to connect to Redis, offline queue disabled');
      }
    }
  }

  /**
   * Prepare a message for relay
   * Does NOT store the message - only validates and prepares for WebSocket delivery
   */
  async prepareForRelay(params: RelayMessageParams): Promise<MessageDTO> {
    logger.info(
      { conversationId: params.conversationId, type: params.type },
      'Preparing message for relay'
    );

    // Validate message size
    if (Buffer.byteLength(params.encryptedContent, 'utf8') > messagingConfig.maxMessageSizeBytes) {
      throw new Error('Message exceeds maximum size');
    }

    const now = new Date();
    const messageId = uuidv4();

    // Create a message DTO for relay (NOT stored in database)
    const messageDTO: MessageDTO = {
      messageId,
      conversationId: params.conversationId,
      senderProfileId: params.senderProfileId,
      senderDisplayName: params.senderProfileId, // Client will resolve display name
      senderAvatarUrl: null,
      type: params.type,
      encryptedContent: params.encryptedContent,
      contentNonce: params.contentNonce,
      encryptionKeyId: params.encryptionKeyId,
      voiceDurationMs: params.voiceDurationMs || null,
      voiceStorageKey: params.voiceStorageKey || null,
      linkedTransactionId: params.linkedTransactionId || null,
      replyToMessageId: params.replyToMessageId || null,
      status: MessageStatus.SENT,
      createdAt: now.toISOString(),
      editedAt: null,
      deliveryReceipts: [],
    };

    // Update conversation lastMessageAt (we still track conversation metadata)
    await db.conversation.update({
      where: { conversationId: params.conversationId },
      data: { lastMessageAt: now },
    });

    return messageDTO;
  }

  /**
   * Queue message for offline user delivery
   * Messages are stored temporarily in Redis with TTL
   */
  async queueForOfflineUser(profileId: string, message: MessageDTO): Promise<void> {
    if (!this.redis) {
      logger.warn('Redis not available, cannot queue offline message');
      return;
    }

    const queueKey = `${this.OFFLINE_QUEUE_PREFIX}${profileId}`;
    const pendingMessage: PendingMessage = {
      ...message,
      createdAt: message.createdAt,
      expiresAt: new Date(Date.now() + this.MESSAGE_TTL_SECONDS * 1000).toISOString(),
    };

    try {
      // Add to list and set TTL
      await this.redis.rpush(queueKey, JSON.stringify(pendingMessage));
      await this.redis.expire(queueKey, this.MESSAGE_TTL_SECONDS);

      logger.debug(
        { profileId, messageId: message.messageId },
        'Message queued for offline delivery'
      );
    } catch (error) {
      logger.error({ error, profileId }, 'Failed to queue offline message');
    }
  }

  /**
   * Get pending messages for a user who just came online
   * Messages are removed from queue after retrieval
   */
  async getPendingMessages(profileId: string): Promise<MessageDTO[]> {
    if (!this.redis) {
      return [];
    }

    const queueKey = `${this.OFFLINE_QUEUE_PREFIX}${profileId}`;

    try {
      // Get all pending messages
      const messages = await this.redis.lrange(queueKey, 0, -1);

      if (messages.length === 0) {
        return [];
      }

      // Delete the queue after retrieval
      await this.redis.del(queueKey);

      const now = new Date();
      const validMessages: MessageDTO[] = [];

      for (const msgStr of messages) {
        try {
          const pending: PendingMessage = JSON.parse(msgStr);

          // Check if message hasn't expired
          if (new Date(pending.expiresAt) > now) {
            validMessages.push({
              messageId: pending.messageId,
              conversationId: pending.conversationId,
              senderProfileId: pending.senderProfileId,
              senderDisplayName: pending.senderProfileId,
              senderAvatarUrl: null,
              type: pending.type,
              encryptedContent: pending.encryptedContent,
              contentNonce: pending.contentNonce,
              encryptionKeyId: pending.encryptionKeyId,
              voiceDurationMs: pending.voiceDurationMs || null,
              voiceStorageKey: pending.voiceStorageKey || null,
              linkedTransactionId: pending.linkedTransactionId || null,
              replyToMessageId: pending.replyToMessageId || null,
              status: MessageStatus.SENT,
              createdAt: pending.createdAt,
              editedAt: null,
              deliveryReceipts: [],
            });
          }
        } catch (e) {
          logger.warn({ error: e }, 'Failed to parse pending message');
        }
      }

      logger.info(
        { profileId, count: validMessages.length },
        'Retrieved pending messages for user'
      );

      return validMessages;
    } catch (error) {
      logger.error({ error, profileId }, 'Failed to get pending messages');
      return [];
    }
  }

  /**
   * Get conversation participants for message relay
   */
  async getConversationParticipants(conversationId: string, excludeProfileId?: string): Promise<string[]> {
    const participants = await db.conversationParticipant.findMany({
      where: {
        conversationId,
        leftAt: null,
        ...(excludeProfileId ? { profileId: { not: excludeProfileId } } : {}),
      },
      select: {
        profileId: true,
      },
    });

    return participants.map((p: { profileId: string }) => p.profileId);
  }

  /**
   * Check if user is participant in conversation
   */
  async isParticipant(conversationId: string, profileId: string): Promise<boolean> {
    const participant = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        profileId,
        leftAt: null,
      },
    });

    return !!participant;
  }

  /**
   * Track unread count (conversation level only, no message storage)
   */
  async incrementUnreadCount(conversationId: string, excludeProfileId: string): Promise<void> {
    await db.conversationParticipant.updateMany({
      where: {
        conversationId,
        profileId: { not: excludeProfileId },
        leftAt: null,
      },
      data: {
        unreadCount: { increment: 1 },
      },
    });
  }

  /**
   * Mark conversation as read (client will provide read timestamp)
   */
  async markConversationAsRead(conversationId: string, profileId: string): Promise<void> {
    await db.conversationParticipant.updateMany({
      where: {
        conversationId,
        profileId,
      },
      data: {
        unreadCount: 0,
        lastReadAt: new Date(),
      },
    });
  }

  /**
   * Get total unread count for user
   */
  async getUnreadCount(profileId: string): Promise<number> {
    const result = await db.conversationParticipant.aggregate({
      where: {
        profileId,
        leftAt: null,
      },
      _sum: {
        unreadCount: true,
      },
    });

    return result._sum.unreadCount || 0;
  }
}

export const messageRelayService = new MessageRelayService();
