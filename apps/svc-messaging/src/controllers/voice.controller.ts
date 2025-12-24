import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { voiceService } from '../services/voice.service';

class VoiceController {
  /**
   * Upload a voice message
   */
  upload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.profileId;
      const file = req.file;

      if (!file) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'No audio file provided',
        });
        return;
      }

      const { encryptedContent, contentNonce, encryptionKeyId, durationMs } = req.body;

      const message = await voiceService.uploadVoiceMessage({
        conversationId,
        senderProfileId: userId,
        audioBuffer: file.buffer,
        mimeType: file.mimetype,
        encryptedContent,
        contentNonce,
        encryptionKeyId,
        durationMs: parseInt(durationMs),
      });

      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to upload voice message');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to upload voice message',
      });
    }
  };

  /**
   * Download a voice message
   */
  download = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { messageId } = req.params;
      const userId = req.user!.profileId;

      const result = await voiceService.downloadVoiceMessage(messageId, userId);

      if (!result) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Voice message not found',
        });
        return;
      }

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Length', result.buffer.length);
      res.send(result.buffer);
    } catch (error) {
      logger.error({ error }, 'Failed to download voice message');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to download voice message',
      });
    }
  };

  /**
   * Get presigned URL for voice message
   */
  getPresignedUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { messageId } = req.params;
      const userId = req.user!.profileId;

      const result = await voiceService.getPresignedUrl(messageId, userId);

      if (!result) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Voice message not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          downloadUrl: result.url,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get presigned URL');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get presigned URL',
      });
    }
  };
}

export const voiceController = new VoiceController();
