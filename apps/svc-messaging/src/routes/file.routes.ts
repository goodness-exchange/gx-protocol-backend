import { Router } from 'express';
import multer from 'multer';
import { fileRelayController } from '../controllers/file-relay.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

// Configure multer for file uploads (max 50MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
});

/**
 * File Routes (Relay-only mode with temporary S3 storage)
 *
 * All routes require authentication.
 * Files are stored temporarily and auto-deleted after 7 days.
 */

// Upload file
router.post(
  '/conversations/:conversationId',
  authenticateJWT,
  upload.single('file'),
  fileRelayController.upload.bind(fileRelayController)
);

// Get download URL (storageKey via query param since it contains slashes)
router.get(
  '/url',
  authenticateJWT,
  fileRelayController.getDownloadUrl.bind(fileRelayController)
);

// Proxy download (streams file through backend for external access)
router.get(
  '/download',
  authenticateJWT,
  fileRelayController.proxyDownload.bind(fileRelayController)
);

// Delete file
router.delete(
  '/:fileId',
  authenticateJWT,
  fileRelayController.delete.bind(fileRelayController)
);

// Get file handling info (public)
router.get('/info', fileRelayController.getInfo.bind(fileRelayController));

export default router;
