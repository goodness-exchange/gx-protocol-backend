/**
 * Documents Controller
 *
 * Handles HTTP requests for document upload and management.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '@gx/core-logger';
import {
  uploadDocument,
  getDocumentsByProfileId,
  getDocumentSignedUrl,
  deleteDocument,
  checkStorageHealth,
} from '../services/documents.service';
import {
  VirusDetectedError,
  FileValidationError,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from '@gx/core-storage';

/**
 * Extended request with file from multer
 */
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

/**
 * Upload a document
 *
 * POST /api/v1/users/:id/documents/upload
 *
 * Content-Type: multipart/form-data
 * - file: The document file
 * - documentType: NATIONAL_ID | PASSPORT | PROOF_OF_ADDRESS | ...
 * - side: FRONT | BACK (optional)
 * - metadata: JSON string with additional info
 */
export async function upload(
  req: MulterRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: profileId } = req.params;
    const { documentType, side, metadata } = req.body;
    const file = req.file;

    // Validate file presence
    if (!file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
        message: 'Please provide a file in the "file" field',
      });
      return;
    }

    // Validate document type
    if (!documentType) {
      res.status(400).json({
        success: false,
        error: 'Missing document type',
        message: 'Please provide a documentType field',
      });
      return;
    }

    // Parse metadata if provided as JSON string
    let parsedMetadata: Record<string, string> | undefined;
    if (metadata) {
      try {
        parsedMetadata =
          typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
      } catch {
        res.status(400).json({
          success: false,
          error: 'Invalid metadata',
          message: 'Metadata must be a valid JSON object',
        });
        return;
      }
    }

    // Verify user owns this profile or is admin
    const requestingUserProfileId = (req as Request & { user?: { profileId: string; role?: string } }).user?.profileId;
    const requestingUserRole = (req as Request & { user?: { profileId: string; role?: string } }).user?.role;

    if (requestingUserProfileId !== profileId && requestingUserRole !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only upload documents for your own profile',
      });
      return;
    }

    // Upload the document
    const result = await uploadDocument({
      file: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      documentType,
      side,
      profileId,
      metadata: parsedMetadata,
    });

    logger.info(
      { profileId, documentId: result.documentId },
      'Document uploaded via API'
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof VirusDetectedError) {
      res.status(422).json({
        success: false,
        error: 'Virus detected',
        message:
          'The uploaded file contains a virus and has been rejected. Please scan your file and try again.',
        virusName: error.virusName,
      });
      return;
    }

    if (error instanceof FileValidationError) {
      res.status(400).json({
        success: false,
        error: 'Invalid file',
        message: error.message,
      });
      return;
    }

    next(error);
  }
}

/**
 * Get all documents for a user
 *
 * GET /api/v1/users/:id/documents
 */
export async function list(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: profileId } = req.params;

    // Verify user owns this profile or is admin
    const requestingUserProfileId = (req as Request & { user?: { profileId: string; role?: string } }).user?.profileId;
    const requestingUserRole = (req as Request & { user?: { profileId: string; role?: string } }).user?.role;

    if (requestingUserProfileId !== profileId && requestingUserRole !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only view documents for your own profile',
      });
      return;
    }

    const documents = await getDocumentsByProfileId(profileId);

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get signed URL for document access
 *
 * GET /api/v1/documents/:documentId/url
 *
 * Admin only - generates time-limited access URL
 */
export async function getUrl(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { documentId } = req.params;
    const expiresIn = parseInt(req.query.expiresIn as string, 10) || 15;

    // Verify admin role
    const requestingUserRole = (req as Request & { user?: { id: string; role: string } }).user?.role;

    if (requestingUserRole !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only admins can access document URLs',
      });
      return;
    }

    const url = await getDocumentSignedUrl(documentId, expiresIn);

    res.json({
      success: true,
      data: {
        url,
        expiresInMinutes: expiresIn,
      },
    });
  } catch (error) {
    if ((error as Error).message === 'Document not found') {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Document not found',
      });
      return;
    }
    next(error);
  }
}

/**
 * Delete a document
 *
 * DELETE /api/v1/documents/:documentId
 *
 * Admin only
 */
export async function remove(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { documentId } = req.params;

    // Verify admin role
    const requestingUserRole = (req as Request & { user?: { id: string; role: string } }).user?.role;

    if (requestingUserRole !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only admins can delete documents',
      });
      return;
    }

    await deleteDocument(documentId);

    res.json({
      success: true,
      message: 'Document deleted successfully',
    });
  } catch (error) {
    if ((error as Error).message === 'Document not found') {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Document not found',
      });
      return;
    }
    next(error);
  }
}

/**
 * Health check for storage service
 *
 * GET /api/v1/documents/health
 */
export async function health(
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const status = await checkStorageHealth();

    const isHealthy = status.storage && status.scanner;

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      data: {
        storage: status.storage ? 'healthy' : 'unhealthy',
        virusScanner: status.scanner ? 'healthy' : 'unhealthy',
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      data: {
        storage: 'unknown',
        virusScanner: 'unknown',
      },
    });
  }
}

/**
 * Get upload constraints
 *
 * GET /api/v1/documents/constraints
 */
export async function constraints(
  _req: Request,
  res: Response
): Promise<void> {
  res.json({
    success: true,
    data: {
      maxFileSizeBytes: MAX_FILE_SIZE,
      maxFileSizeMB: MAX_FILE_SIZE / (1024 * 1024),
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      documentTypes: [
        'NATIONAL_ID',
        'PASSPORT',
        'DRIVERS_LICENSE',
        'PROOF_OF_ADDRESS',
        'DEATH_CERTIFICATE',
        'DIVORCE_CERTIFICATE',
        'BUSINESS_REGISTRATION',
        'TAX_REGISTRATION',
        'BANK_STATEMENT',
        'UTILITY_BILL',
        'SELFIE_PHOTO',
        'OTHER',
      ],
      documentSides: ['FRONT', 'BACK'],
    },
  });
}

export const documentsController = {
  upload,
  list,
  getUrl,
  remove,
  health,
  constraints,
};
