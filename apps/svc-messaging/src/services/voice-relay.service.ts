import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@gx/core-logger';
import { messagingConfig } from '../config';
import { messageRelayService } from './message-relay.service';
import { MessageType, MessageDTO } from '../types/dtos';
import { Redis } from 'ioredis';

interface UploadVoiceParams {
  conversationId: string;
  senderProfileId: string;
  audioBuffer: Buffer;
  mimeType: string;
  encryptedContent: string;  // Encrypted metadata (waveform, etc.)
  contentNonce: string;
  encryptionKeyId: string;
  durationMs: number;
}

interface VoiceMetadata {
  storageKey: string;
  conversationId: string;
  senderProfileId: string;
  durationMs: number;
  mimeType: string;
  uploadedAt: string;
  expiresAt: string;
}

/**
 * Voice Relay Service
 *
 * Voice messages in RELAY-ONLY mode:
 * - Voice files are uploaded to S3 with 24-hour TTL
 * - Metadata stored in Redis with matching TTL
 * - After download confirmation, files are deleted
 * - No permanent server storage
 */
class VoiceRelayService {
  private s3Client: S3Client | null = null;
  private redis: Redis | null = null;
  private readonly VOICE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
  private readonly VOICE_METADATA_PREFIX = 'voice:meta:';

  constructor() {
    this.initS3();
    this.initRedis();
  }

  private initS3(): void {
    if (messagingConfig.awsAccessKeyId && messagingConfig.awsSecretAccessKey) {
      this.s3Client = new S3Client({
        region: messagingConfig.s3Region,
        credentials: {
          accessKeyId: messagingConfig.awsAccessKeyId,
          secretAccessKey: messagingConfig.awsSecretAccessKey,
        },
      });
      logger.info('S3 client initialized for voice relay');
    } else {
      logger.warn('S3 credentials not configured, voice messages disabled');
    }
  }

  private async initRedis(): Promise<void> {
    if (messagingConfig.redisUrl) {
      try {
        this.redis = new Redis(messagingConfig.redisUrl);
        this.redis.on('error', (err) => {
          logger.error({ error: err }, 'Redis error in VoiceRelayService');
        });
      } catch (error) {
        logger.warn({ error }, 'Failed to connect to Redis for voice metadata');
      }
    }
  }

  /**
   * Upload voice message with temporary storage
   * File auto-expires after 24 hours
   */
  async uploadVoiceMessage(params: UploadVoiceParams): Promise<MessageDTO> {
    // Validate duration
    if (params.durationMs > messagingConfig.maxVoiceDurationMs) {
      throw new Error(`Voice message exceeds maximum duration of ${messagingConfig.maxVoiceDurationMs}ms`);
    }

    // Verify user is participant
    const isParticipant = await messageRelayService.isParticipant(
      params.conversationId,
      params.senderProfileId
    );
    if (!isParticipant) {
      throw new Error('User is not a participant in this conversation');
    }

    // Generate unique storage key
    const voiceId = uuidv4();
    const storageKey = `voice/temp/${params.conversationId}/${voiceId}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.VOICE_TTL_SECONDS * 1000);

    // Upload to S3 with lifecycle (or simulate for dev)
    if (this.s3Client) {
      await this.uploadToS3(storageKey, params.audioBuffer, params.mimeType, expiresAt);
    } else {
      logger.info(
        { storageKey, size: params.audioBuffer.length, durationMs: params.durationMs },
        'Voice message upload simulated (S3 not configured)'
      );
    }

    // Store metadata in Redis with TTL
    const metadata: VoiceMetadata = {
      storageKey,
      conversationId: params.conversationId,
      senderProfileId: params.senderProfileId,
      durationMs: params.durationMs,
      mimeType: params.mimeType,
      uploadedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    if (this.redis) {
      await this.redis.setex(
        `${this.VOICE_METADATA_PREFIX}${voiceId}`,
        this.VOICE_TTL_SECONDS,
        JSON.stringify(metadata)
      );
    }

    // Create message DTO for relay (NO DATABASE STORAGE)
    const message = await messageRelayService.prepareForRelay({
      conversationId: params.conversationId,
      senderProfileId: params.senderProfileId,
      type: MessageType.VOICE,
      encryptedContent: params.encryptedContent,
      contentNonce: params.contentNonce,
      encryptionKeyId: params.encryptionKeyId,
      voiceDurationMs: params.durationMs,
      voiceStorageKey: voiceId, // Use voiceId as reference, not full path
    });

    logger.info(
      { voiceId, durationMs: params.durationMs, expiresAt: expiresAt.toISOString() },
      'Voice message uploaded with temporary storage'
    );

    return message;
  }

  /**
   * Get presigned URL for voice download
   * URL expires in 1 hour (less than file TTL)
   */
  async getDownloadUrl(
    voiceId: string,
    requestingProfileId: string
  ): Promise<{ url: string; expiresAt: string; durationMs: number; mimeType: string } | null> {
    // Get metadata from Redis
    const metadataStr = this.redis
      ? await this.redis.get(`${this.VOICE_METADATA_PREFIX}${voiceId}`)
      : null;

    if (!metadataStr) {
      logger.warn({ voiceId }, 'Voice metadata not found or expired');
      return null;
    }

    const metadata: VoiceMetadata = JSON.parse(metadataStr);

    // Verify requester is participant in conversation
    const isParticipant = await messageRelayService.isParticipant(
      metadata.conversationId,
      requestingProfileId
    );

    if (!isParticipant) {
      logger.warn({ voiceId, requestingProfileId }, 'Unauthorized voice download attempt');
      return null;
    }

    // Check if file hasn't expired
    if (new Date(metadata.expiresAt) < new Date()) {
      logger.warn({ voiceId }, 'Voice file has expired');
      return null;
    }

    // Generate presigned URL
    const urlExpiresIn = 3600; // 1 hour
    let url: string;

    if (this.s3Client) {
      const command = new GetObjectCommand({
        Bucket: messagingConfig.s3BucketVoice,
        Key: metadata.storageKey,
      });
      url = await getSignedUrl(this.s3Client, command, { expiresIn: urlExpiresIn });
    } else {
      // Dev mode - return mock URL
      url = `http://localhost:3007/api/v1/voice/mock/${voiceId}`;
    }

    const expiresAt = new Date(Date.now() + urlExpiresIn * 1000).toISOString();

    return {
      url,
      expiresAt,
      durationMs: metadata.durationMs,
      mimeType: metadata.mimeType,
    };
  }

  /**
   * Confirm voice message was downloaded by all recipients
   * This triggers early deletion of the file
   */
  async confirmDelivery(voiceId: string, recipientProfileId: string): Promise<void> {
    const metadataStr = this.redis
      ? await this.redis.get(`${this.VOICE_METADATA_PREFIX}${voiceId}`)
      : null;

    if (!metadataStr) {
      return; // Already expired/deleted
    }

    const metadata: VoiceMetadata = JSON.parse(metadataStr);

    // Get all participants
    const participants = await messageRelayService.getConversationParticipants(
      metadata.conversationId,
      metadata.senderProfileId // Exclude sender
    );

    // Track confirmations in Redis
    if (this.redis) {
      const confirmKey = `voice:confirm:${voiceId}`;
      await this.redis.sadd(confirmKey, recipientProfileId);
      await this.redis.expire(confirmKey, this.VOICE_TTL_SECONDS);

      const confirmCount = await this.redis.scard(confirmKey);

      // If all recipients confirmed, delete early
      if (confirmCount >= participants.length) {
        await this.deleteVoiceFile(voiceId, metadata.storageKey);
        await this.redis.del(confirmKey);
        logger.info({ voiceId }, 'Voice file deleted after all recipients confirmed');
      }
    }
  }

  /**
   * Delete voice file from storage
   */
  async deleteVoiceFile(voiceId: string, storageKey?: string): Promise<void> {
    // Get storage key if not provided
    if (!storageKey && this.redis) {
      const metadataStr = await this.redis.get(`${this.VOICE_METADATA_PREFIX}${voiceId}`);
      if (metadataStr) {
        const metadata: VoiceMetadata = JSON.parse(metadataStr);
        storageKey = metadata.storageKey;
      }
    }

    if (!storageKey) {
      return;
    }

    // Delete from S3
    if (this.s3Client) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: messagingConfig.s3BucketVoice,
            Key: storageKey,
          })
        );
        logger.debug({ storageKey }, 'Voice file deleted from S3');
      } catch (error) {
        logger.error({ error, storageKey }, 'Failed to delete voice file from S3');
      }
    }

    // Delete metadata from Redis
    if (this.redis) {
      await this.redis.del(`${this.VOICE_METADATA_PREFIX}${voiceId}`);
    }
  }

  /**
   * Upload to S3 with expiration metadata
   */
  private async uploadToS3(
    key: string,
    buffer: Buffer,
    mimeType: string,
    expiresAt: Date
  ): Promise<void> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: messagingConfig.s3BucketVoice,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ServerSideEncryption: 'AES256',
        Expires: expiresAt,
        Metadata: {
          'x-gx-temp-file': 'true',
          'x-gx-expires-at': expiresAt.toISOString(),
        },
        // S3 Lifecycle rules should auto-delete expired objects
        // This is set up via bucket configuration
      })
    );
  }
}

export const voiceRelayService = new VoiceRelayService();
