/**
 * Document Routes
 *
 * Handles document upload and management endpoints.
 */

import { Router } from 'express';
import multer from 'multer';
import { documentsController } from '../controllers/documents.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { moderateRateLimiter } from '@gx/core-http';
import { MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from '@gx/core-storage';

const router = Router();

/**
 * Configure multer for memory storage
 * Files are stored in memory as buffers before being uploaded to Google Drive
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype as typeof ALLOWED_MIME_TYPES[number])) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`));
    }
  },
});

// ============================================
// User Document Routes (authenticated)
// ============================================

/**
 * POST /api/v1/users/:id/documents/upload
 * Upload a document for a user
 * Requires authentication
 * Rate limited: 60 requests per minute
 *
 * @param id - User profile ID (UUID)
 * @body multipart/form-data:
 *   - file: The document file (max 10MB)
 *   - documentType: NATIONAL_ID | PASSPORT | PROOF_OF_ADDRESS | ...
 *   - side: FRONT | BACK (optional)
 *   - metadata: JSON string with documentNumber, issuingCountry, etc. (optional)
 * @returns {data: UploadDocumentResult}
 */
router.post(
  '/users/:id/documents/upload',
  moderateRateLimiter,
  authenticateJWT,
  upload.single('file'),
  documentsController.upload
);

/**
 * GET /api/v1/users/:id/documents
 * List all documents for a user
 * Requires authentication
 *
 * @param id - User profile ID (UUID)
 * @returns {data: UploadDocumentResult[]}
 */
router.get(
  '/users/:id/documents',
  authenticateJWT,
  documentsController.list
);

// ============================================
// Document Management Routes (admin)
// ============================================

/**
 * GET /api/v1/documents/:documentId/url
 * Get a signed URL for document access
 * Admin only - generates time-limited access URL
 *
 * @param documentId - Document ID (UUID)
 * @query expiresIn - URL expiration in minutes (default: 15)
 * @returns {data: {url: string, expiresInMinutes: number}}
 */
router.get(
  '/documents/:documentId/url',
  authenticateJWT,
  documentsController.getUrl
);

/**
 * DELETE /api/v1/documents/:documentId
 * Delete a document
 * Admin only
 *
 * @param documentId - Document ID (UUID)
 * @returns {message: string}
 */
router.delete(
  '/documents/:documentId',
  authenticateJWT,
  documentsController.remove
);

// ============================================
// Utility Routes (public)
// ============================================

/**
 * GET /api/v1/documents/health
 * Health check for storage and virus scanning services
 *
 * @returns {data: {storage: string, virusScanner: string}}
 */
router.get('/documents/health', documentsController.health);

/**
 * GET /api/v1/documents/constraints
 * Get upload constraints (max file size, allowed types, etc.)
 *
 * @returns {data: {maxFileSizeBytes, allowedMimeTypes, documentTypes, ...}}
 */
router.get('/documents/constraints', documentsController.constraints);

export default router;
