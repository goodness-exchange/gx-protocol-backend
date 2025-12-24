import { Request, Response } from 'express';
import { logger } from '@gx/core-logger';
import { fileRelayService } from '../services/file-relay.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { SUPPORTED_FILE_TYPES } from '../types/dtos';

/**
 * File Relay Controller
 *
 * RELAY-ONLY MODE with temporary storage:
 * - Files stored in S3 with 7-day TTL
 * - Files auto-deleted after expiry
 * - Supports documents and images
 */
class FileRelayController {
  /**
   * POST /api/v1/files/conversations/:conversationId
   * Upload a file with temporary storage
   */
  async upload(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file provided' });
        return;
      }

      const {
        encryptedContent,
        contentNonce,
        encryptionKeyId,
        fileName,
      } = req.body;

      // Validate required fields
      if (!encryptedContent || !contentNonce || !encryptionKeyId) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: encryptedContent, contentNonce, encryptionKeyId',
        });
        return;
      }

      // Validate file type
      const validation = fileRelayService.validateFile(req.file.mimetype, req.file.size);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error,
        });
        return;
      }

      const message = await fileRelayService.uploadFile({
        conversationId,
        senderProfileId: userId,
        fileBuffer: req.file.buffer,
        fileName: fileName || req.file.originalname,
        mimeType: req.file.mimetype,
        encryptedContent,
        contentNonce,
        encryptionKeyId,
      });

      logger.info(
        { messageId: message.messageId, conversationId, fileName: message.fileName },
        'File uploaded with temporary storage'
      );

      res.status(201).json({
        success: true,
        data: message,
        meta: {
          storageTTL: '7 days',
          note: 'File will be auto-deleted after 7 days.',
        },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to upload file');

      if (error.message.includes('not a participant')) {
        res.status(403).json({ success: false, error: error.message });
      } else if (error.message.includes('Unsupported') || error.message.includes('too large')) {
        res.status(400).json({ success: false, error: error.message });
      } else {
        res.status(500).json({ success: false, error: 'Failed to upload file' });
      }
    }
  }

  /**
   * GET /api/v1/files/:fileId/url
   * Get presigned download URL for file
   */
  async getDownloadUrl(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { fileId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      // fileId is the storage key
      const result = await fileRelayService.getDownloadUrl(fileId, userId);

      if (!result) {
        res.status(404).json({
          success: false,
          error: 'File not found or expired',
        });
        return;
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get file download URL');

      if (error.message.includes('Access denied')) {
        res.status(403).json({ success: false, error: error.message });
      } else {
        res.status(500).json({ success: false, error: 'Failed to get download URL' });
      }
    }
  }

  /**
   * DELETE /api/v1/files/:fileId
   * Delete a file (sender only)
   */
  async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { fileId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      // TODO: Verify sender owns the file before deletion
      await fileRelayService.deleteFile(fileId);

      res.json({
        success: true,
        data: { deleted: true },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to delete file');
      res.status(500).json({ success: false, error: 'Failed to delete file' });
    }
  }

  /**
   * GET /api/v1/files/info
   * Get information about file handling
   */
  async getInfo(_req: Request, res: Response): Promise<void> {
    // Build supported types list
    const documentTypes: string[] = [];
    const imageTypes: string[] = [];

    for (const [_mimeType, config] of Object.entries(SUPPORTED_FILE_TYPES)) {
      if (config.category === 'document') {
        documentTypes.push(`.${config.ext}`);
      } else if (config.category === 'image') {
        imageTypes.push(`.${config.ext}`);
      }
    }

    res.json({
      success: true,
      data: {
        mode: 'temporary-storage',
        description: 'Files are stored temporarily and auto-deleted after 7 days.',
        limits: {
          maxDocumentSizeMb: 50,
          maxImageSizeMb: 10,
          storageTTL: '7 days',
        },
        supportedTypes: {
          documents: documentTypes,
          images: imageTypes,
        },
        features: {
          thumbnails: true,
          thumbnailSize: 200,
        },
        endpoints: {
          upload: 'POST /api/v1/files/conversations/:conversationId',
          getUrl: 'GET /api/v1/files/:fileId/url',
          delete: 'DELETE /api/v1/files/:fileId',
        },
      },
    });
  }
}

export const fileRelayController = new FileRelayController();
