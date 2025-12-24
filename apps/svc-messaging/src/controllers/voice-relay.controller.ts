import { Request, Response } from 'express';
import { logger } from '@gx/core-logger';
import { voiceRelayService } from '../services/voice-relay.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

/**
 * Voice Relay Controller
 *
 * RELAY-ONLY MODE with temporary storage:
 * - Voice files stored in S3 with 24-hour TTL
 * - Files auto-deleted after all recipients download
 * - No permanent server storage
 */
class VoiceRelayController {
  /**
   * POST /api/v1/voice/conversations/:conversationId
   * Upload a voice message with temporary storage
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
        res.status(400).json({ success: false, error: 'No audio file provided' });
        return;
      }

      const {
        encryptedContent,
        contentNonce,
        encryptionKeyId,
        durationMs,
      } = req.body;

      // Validate required fields
      if (!encryptedContent || !contentNonce || !encryptionKeyId || !durationMs) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: encryptedContent, contentNonce, encryptionKeyId, durationMs',
        });
        return;
      }

      const message = await voiceRelayService.uploadVoiceMessage({
        conversationId,
        senderProfileId: userId,
        audioBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        encryptedContent,
        contentNonce,
        encryptionKeyId,
        durationMs: parseInt(durationMs, 10),
      });

      logger.info(
        { messageId: message.messageId, conversationId, durationMs },
        'Voice message uploaded with temporary storage'
      );

      res.status(201).json({
        success: true,
        data: message,
        meta: {
          storageTTL: '24 hours',
          note: 'Voice file will be auto-deleted after 24 hours or when all recipients download.',
        },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to upload voice message');

      if (error.message.includes('maximum duration')) {
        res.status(400).json({ success: false, error: error.message });
      } else if (error.message.includes('not a participant')) {
        res.status(403).json({ success: false, error: error.message });
      } else {
        res.status(500).json({ success: false, error: 'Failed to upload voice message' });
      }
    }
  }

  /**
   * GET /api/v1/voice/:voiceId/url
   * Get presigned download URL for voice message
   */
  async getDownloadUrl(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { voiceId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const result = await voiceRelayService.getDownloadUrl(voiceId, userId);

      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Voice message not found or expired',
        });
        return;
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to get voice download URL');
      res.status(500).json({ success: false, error: 'Failed to get download URL' });
    }
  }

  /**
   * POST /api/v1/voice/:voiceId/confirm
   * Confirm voice message was downloaded
   * This helps with early deletion of temporary files
   */
  async confirmDownload(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { voiceId } = req.params;
      const userId = req.user?.profileId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      await voiceRelayService.confirmDelivery(voiceId, userId);

      res.json({
        success: true,
        data: {
          voiceId,
          confirmed: true,
        },
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to confirm voice download');
      res.status(500).json({ success: false, error: 'Failed to confirm download' });
    }
  }

  /**
   * GET /api/v1/voice/info
   * Get information about voice message handling
   */
  async getInfo(_req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      data: {
        mode: 'temporary-storage',
        description: 'Voice messages are stored temporarily and auto-deleted.',
        limits: {
          maxDurationMs: 60000,
          maxFileSizeMb: 10,
          storageTTL: '24 hours',
        },
        supportedFormats: [
          'audio/webm',
          'audio/mp4',
          'audio/mpeg',
          'audio/ogg',
          'audio/wav',
          'audio/x-m4a',
        ],
        endpoints: {
          upload: 'POST /api/v1/voice/conversations/:conversationId',
          getUrl: 'GET /api/v1/voice/:voiceId/url',
          confirm: 'POST /api/v1/voice/:voiceId/confirm',
        },
      },
    });
  }
}

export const voiceRelayController = new VoiceRelayController();
