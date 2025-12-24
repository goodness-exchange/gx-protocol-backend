import { Router } from 'express';
import multer from 'multer';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { voiceRelayController } from '../controllers/voice-relay.controller';
import { messagingConfig } from '../config';

const router = Router();

/**
 * Voice Routes - TEMPORARY STORAGE MODE
 *
 * Voice messages in relay mode:
 * - Uploaded to S3 with 24-hour TTL
 * - Auto-deleted after all recipients download
 * - No permanent server storage
 */

// Configure multer for voice message uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: messagingConfig.maxVoiceFileSizeMb * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    // Accept common audio formats
    const allowedMimes = [
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/x-m4a',
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  },
});

/**
 * GET /api/v1/voice/info
 * Get information about voice message handling (public)
 */
router.get('/info', voiceRelayController.getInfo);

// All other routes require authentication
router.use(authenticateJWT);

/**
 * POST /api/v1/voice/conversations/:conversationId
 * Upload a voice message with temporary storage
 */
router.post(
  '/conversations/:conversationId',
  upload.single('audio'),
  voiceRelayController.upload
);

/**
 * GET /api/v1/voice/:voiceId/url
 * Get presigned download URL for voice message
 */
router.get('/:voiceId/url', voiceRelayController.getDownloadUrl);

/**
 * POST /api/v1/voice/:voiceId/confirm
 * Confirm voice message was downloaded
 */
router.post('/:voiceId/confirm', voiceRelayController.confirmDownload);

export default router;
