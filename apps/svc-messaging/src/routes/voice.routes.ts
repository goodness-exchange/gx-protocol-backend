import { Router } from 'express';
import multer from 'multer';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { voiceController } from '../controllers/voice.controller';
import { messagingConfig } from '../config';

const router = Router();

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

// All routes require authentication
router.use(authenticateJWT);

/**
 * POST /api/v1/voice/conversations/:conversationId
 * Upload a voice message
 */
router.post(
  '/conversations/:conversationId',
  upload.single('audio'),
  voiceController.upload
);

/**
 * GET /api/v1/voice/:messageId
 * Download a voice message
 */
router.get('/:messageId', voiceController.download);

/**
 * GET /api/v1/voice/:messageId/url
 * Get presigned URL for voice message
 */
router.get('/:messageId/url', voiceController.getPresignedUrl);

export default router;
