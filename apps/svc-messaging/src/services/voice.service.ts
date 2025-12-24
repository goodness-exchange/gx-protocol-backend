import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@gx/core-logger';
import { messagingConfig } from '../config';
import { messageService } from './message.service';
import { MessageType, MessageDTO } from '../types/dtos';
import { conversationService } from './conversation.service';

interface UploadVoiceParams {
  conversationId: string;
  senderProfileId: string;
  audioBuffer: Buffer;
  mimeType: string;
  encryptedContent: string;
  contentNonce: string;
  encryptionKeyId: string;
  durationMs: number;
}

class VoiceService {
  private s3Client: S3Client | null = null;

  constructor() {
    if (messagingConfig.awsAccessKeyId && messagingConfig.awsSecretAccessKey) {
      this.s3Client = new S3Client({
        region: messagingConfig.s3Region,
        credentials: {
          accessKeyId: messagingConfig.awsAccessKeyId,
          secretAccessKey: messagingConfig.awsSecretAccessKey,
        },
      });
      logger.info('S3 client initialized for voice messages');
    } else {
      logger.warn('S3 credentials not configured, voice messages will be stored locally');
    }
  }

  /**
   * Upload a voice message
   */
  async uploadVoiceMessage(params: UploadVoiceParams): Promise<MessageDTO> {
    // Validate duration
    if (params.durationMs > messagingConfig.maxVoiceDurationMs) {
      throw new Error(`Voice message exceeds maximum duration of ${messagingConfig.maxVoiceDurationMs}ms`);
    }

    // Verify user is participant
    const isParticipant = await conversationService.isParticipant(
      params.conversationId,
      params.senderProfileId
    );
    if (!isParticipant) {
      throw new Error('User is not a participant in this conversation');
    }

    // Generate storage key
    const storageKey = `voice/${params.conversationId}/${uuidv4()}`;

    // Upload to S3 (or store locally for development)
    if (this.s3Client) {
      await this.uploadToS3(storageKey, params.audioBuffer, params.mimeType);
    } else {
      // For development, just log
      logger.info({ storageKey, size: params.audioBuffer.length }, 'Voice message would be uploaded');
    }

    // Create message record
    const message = await messageService.createMessage({
      conversationId: params.conversationId,
      senderProfileId: params.senderProfileId,
      type: MessageType.VOICE,
      encryptedContent: params.encryptedContent,
      contentNonce: params.contentNonce,
      encryptionKeyId: params.encryptionKeyId,
      voiceDurationMs: params.durationMs,
      voiceStorageKey: storageKey,
    });

    logger.info(
      { messageId: message.messageId, durationMs: params.durationMs },
      'Voice message uploaded'
    );

    return message;
  }

  /**
   * Download a voice message
   */
  async downloadVoiceMessage(
    messageId: string,
    userId: string
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const message = await messageService.getById(messageId, userId);

    if (!message || message.type !== MessageType.VOICE || !message.voiceStorageKey) {
      return null;
    }

    if (this.s3Client) {
      return this.downloadFromS3(message.voiceStorageKey);
    }

    // For development, return mock data
    return {
      buffer: Buffer.from('mock audio data'),
      mimeType: 'audio/webm',
    };
  }

  /**
   * Get presigned URL for voice message download
   */
  async getPresignedUrl(
    messageId: string,
    userId: string
  ): Promise<{ url: string; expiresAt: string } | null> {
    const message = await messageService.getById(messageId, userId);

    if (!message || message.type !== MessageType.VOICE || !message.voiceStorageKey) {
      return null;
    }

    if (!this.s3Client) {
      // For development, return mock URL
      return {
        url: `http://localhost:3007/api/v1/voice/${messageId}`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
    }

    const command = new GetObjectCommand({
      Bucket: messagingConfig.s3BucketVoice,
      Key: message.voiceStorageKey,
    });

    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    return { url, expiresAt };
  }

  /**
   * Delete voice message from storage
   */
  async deleteVoiceMessage(storageKey: string): Promise<void> {
    if (!this.s3Client) {
      return;
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: messagingConfig.s3BucketVoice,
          Key: storageKey,
        })
      );
      logger.info({ storageKey }, 'Voice message deleted from S3');
    } catch (error) {
      logger.error({ error, storageKey }, 'Failed to delete voice message from S3');
    }
  }

  /**
   * Upload file to S3
   */
  private async uploadToS3(key: string, buffer: Buffer, mimeType: string): Promise<void> {
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
      })
    );
  }

  /**
   * Download file from S3
   */
  private async downloadFromS3(key: string): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: messagingConfig.s3BucketVoice,
        Key: key,
      })
    );

    const buffer = await response.Body?.transformToByteArray();

    return {
      buffer: Buffer.from(buffer || []),
      mimeType: response.ContentType || 'audio/webm',
    };
  }
}

export const voiceService = new VoiceService();
