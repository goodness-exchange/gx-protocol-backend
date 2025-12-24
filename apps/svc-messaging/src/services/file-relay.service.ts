import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import {
  MessageDTO,
  MessageType,
  MessageStatus,
  SUPPORTED_FILE_TYPES,
  SupportedMimeType,
} from '../types/dtos';
import { messagingConfig } from '../config';

interface FileUploadParams {
  conversationId: string;
  senderProfileId: string;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  encryptedContent: string;
  contentNonce: string;
  encryptionKeyId: string;
}

interface FileDownloadResult {
  downloadUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string;
  thumbnailUrl?: string;
}

/**
 * File Relay Service
 *
 * RELAY-ONLY MODE with temporary S3 storage:
 * - Files stored in S3 with 7-day TTL
 * - Files auto-deleted after expiry
 * - Supports documents (PDF, DOCX, XLSX, etc.) and images
 * - Generates thumbnails for images
 */
class FileRelayService {
  private s3Client: S3Client | null = null;
  private readonly THUMBNAIL_SIZE = 200;

  constructor() {
    this.initS3Client();
  }

  private initS3Client(): void {
    if (messagingConfig.s3Region && messagingConfig.awsAccessKeyId && messagingConfig.awsSecretAccessKey) {
      this.s3Client = new S3Client({
        region: messagingConfig.s3Region,
        credentials: {
          accessKeyId: messagingConfig.awsAccessKeyId,
          secretAccessKey: messagingConfig.awsSecretAccessKey,
        },
      });
      logger.info('FileRelayService S3 client initialized');
    } else {
      logger.warn('S3 credentials not configured, file storage disabled');
    }
  }

  /**
   * Validate file type and size
   */
  validateFile(mimeType: string, sizeBytes: number): { valid: boolean; error?: string; category?: string } {
    const fileConfig = SUPPORTED_FILE_TYPES[mimeType as SupportedMimeType];

    if (!fileConfig) {
      return {
        valid: false,
        error: `Unsupported file type: ${mimeType}. Supported types: PDF, DOCX, XLSX, PPT, TXT, CSV, JPG, PNG, GIF, WEBP`,
      };
    }

    const maxSizeBytes = fileConfig.maxSizeMb * 1024 * 1024;
    if (sizeBytes > maxSizeBytes) {
      return {
        valid: false,
        error: `File too large. Maximum size for ${fileConfig.ext} files is ${fileConfig.maxSizeMb}MB`,
      };
    }

    return { valid: true, category: fileConfig.category };
  }

  /**
   * Upload a file with temporary storage
   */
  async uploadFile(params: FileUploadParams): Promise<MessageDTO> {
    if (!this.s3Client) {
      throw new Error('File storage not configured');
    }

    // Validate participant
    const isParticipant = await this.isParticipant(params.conversationId, params.senderProfileId);
    if (!isParticipant) {
      throw new Error('User is not a participant in this conversation');
    }

    // Validate file
    const validation = this.validateFile(params.mimeType, params.fileBuffer.length);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const messageId = uuidv4();
    const fileId = uuidv4();
    const fileConfig = SUPPORTED_FILE_TYPES[params.mimeType as SupportedMimeType];
    const storageKey = `files/${params.conversationId}/${fileId}.${fileConfig.ext}`;
    const isImage = validation.category === 'image';

    // Upload main file
    await this.s3Client.send(new PutObjectCommand({
      Bucket: messagingConfig.s3BucketVoice, // Reuse voice bucket for files
      Key: storageKey,
      Body: params.fileBuffer,
      ContentType: params.mimeType,
      Metadata: {
        'message-id': messageId,
        'conversation-id': params.conversationId,
        'sender-profile-id': params.senderProfileId,
        'original-filename': params.fileName,
      },
    }));

    let thumbnailStorageKey: string | null = null;
    let imageWidth: number | null = null;
    let imageHeight: number | null = null;

    // Generate thumbnail for images
    if (isImage) {
      try {
        const metadata = await sharp(params.fileBuffer).metadata();
        imageWidth = metadata.width || null;
        imageHeight = metadata.height || null;

        const thumbnail = await sharp(params.fileBuffer)
          .resize(this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE, { fit: 'inside' })
          .jpeg({ quality: 80 })
          .toBuffer();

        thumbnailStorageKey = `files/${params.conversationId}/${fileId}_thumb.jpg`;

        await this.s3Client.send(new PutObjectCommand({
          Bucket: messagingConfig.s3BucketVoice,
          Key: thumbnailStorageKey,
          Body: thumbnail,
          ContentType: 'image/jpeg',
        }));
      } catch (error) {
        logger.warn({ error }, 'Failed to generate thumbnail');
      }
    }

    // Update conversation lastMessageAt
    await db.conversation.update({
      where: { conversationId: params.conversationId },
      data: { lastMessageAt: new Date() },
    });

    const now = new Date();

    logger.info(
      { messageId, conversationId: params.conversationId, fileName: params.fileName, mimeType: params.mimeType },
      'File uploaded with temporary storage'
    );

    return {
      messageId,
      conversationId: params.conversationId,
      senderProfileId: params.senderProfileId,
      senderDisplayName: params.senderProfileId,
      senderAvatarUrl: null,
      type: isImage ? MessageType.IMAGE : MessageType.FILE,
      encryptedContent: params.encryptedContent,
      contentNonce: params.contentNonce,
      encryptionKeyId: params.encryptionKeyId,
      voiceDurationMs: null,
      voiceStorageKey: null,
      fileStorageKey: storageKey,
      fileName: params.fileName,
      fileMimeType: params.mimeType,
      fileSizeBytes: params.fileBuffer.length,
      imageWidth,
      imageHeight,
      thumbnailStorageKey,
      linkedTransactionId: null,
      replyToMessageId: null,
      status: MessageStatus.SENT,
      createdAt: now.toISOString(),
      editedAt: null,
      deliveryReceipts: [],
    };
  }

  /**
   * Get presigned download URL for file
   */
  async getDownloadUrl(fileStorageKey: string, profileId: string): Promise<FileDownloadResult | null> {
    if (!this.s3Client) {
      throw new Error('File storage not configured');
    }

    // Extract conversation ID from storage key
    const parts = fileStorageKey.split('/');
    if (parts.length < 3) {
      return null;
    }
    const conversationId = parts[1];

    // Verify user is participant
    const isParticipant = await this.isParticipant(conversationId, profileId);
    if (!isParticipant) {
      throw new Error('Access denied: not a participant');
    }

    try {
      // Get file metadata
      const headCommand = new GetObjectCommand({
        Bucket: messagingConfig.s3BucketVoice,
        Key: fileStorageKey,
      });

      const headResponse = await this.s3Client.send(headCommand);

      // Generate presigned URL (valid for 1 hour)
      const expiresIn = 3600;
      const downloadUrl = await getSignedUrl(this.s3Client, headCommand, { expiresIn });

      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      const result: FileDownloadResult = {
        downloadUrl,
        fileName: headResponse.Metadata?.['original-filename'] || 'download',
        mimeType: headResponse.ContentType || 'application/octet-stream',
        sizeBytes: headResponse.ContentLength || 0,
        expiresAt: expiresAt.toISOString(),
      };

      // Get thumbnail URL if available (for images)
      const thumbnailKey = fileStorageKey.replace(/\.[^.]+$/, '_thumb.jpg');
      try {
        const thumbCommand = new GetObjectCommand({
          Bucket: messagingConfig.s3BucketVoice,
          Key: thumbnailKey,
        });
        result.thumbnailUrl = await getSignedUrl(this.s3Client, thumbCommand, { expiresIn });
      } catch {
        // Thumbnail doesn't exist, that's fine
      }

      return result;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Delete a file (for cleanup or user deletion)
   */
  async deleteFile(fileStorageKey: string): Promise<void> {
    if (!this.s3Client) {
      return;
    }

    try {
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: messagingConfig.s3BucketVoice,
        Key: fileStorageKey,
      }));

      // Also try to delete thumbnail
      const thumbnailKey = fileStorageKey.replace(/\.[^.]+$/, '_thumb.jpg');
      try {
        await this.s3Client.send(new DeleteObjectCommand({
          Bucket: messagingConfig.s3BucketVoice,
          Key: thumbnailKey,
        }));
      } catch {
        // Thumbnail might not exist
      }

      logger.info({ fileStorageKey }, 'File deleted');
    } catch (error) {
      logger.error({ error, fileStorageKey }, 'Failed to delete file');
    }
  }

  /**
   * Check if user is participant in conversation
   */
  private async isParticipant(conversationId: string, profileId: string): Promise<boolean> {
    const participant = await db.conversationParticipant.findFirst({
      where: {
        conversationId,
        profileId,
        leftAt: null,
      },
    });
    return !!participant;
  }
}

export const fileRelayService = new FileRelayService();
