/**
 * Document Service
 *
 * Handles document upload, storage, and retrieval for KYC/KYR workflows.
 * Uses Google Drive for storage and ClamAV for virus scanning.
 */

import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import {
  createStorageService,
  DocumentStorageService,
  DocumentType,
  DocumentSide,
  buildUserDocumentPath,
  VirusDetectedError,
  FileValidationError,
  type FileMetadata,
  type StorageResult,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from '@gx/core-storage';
import crypto from 'crypto';

// Lazy initialization of storage service
let storageService: DocumentStorageService | null = null;

function getStorageService(): DocumentStorageService {
  if (!storageService) {
    storageService = createStorageService();
  }
  return storageService;
}

/**
 * Input for document upload
 */
export interface UploadDocumentInput {
  /** File buffer */
  file: Buffer;
  /** Original file name */
  originalName: string;
  /** MIME type */
  mimeType: string;
  /** Document type (NATIONAL_ID, PASSPORT, etc.) */
  documentType: string;
  /** Document side (FRONT, BACK) */
  side?: string;
  /** User profile ID */
  profileId: string;
  /** Additional metadata */
  metadata?: {
    documentNumber?: string;
    issuingCountry?: string;
    issuedDate?: string;
    expiryDate?: string;
  };
}

/**
 * Result of a document upload
 */
export interface UploadDocumentResult {
  documentId: string;
  fileId: string;
  storageUrl: string;
  fileName: string;
  hash: string;
  size: number;
  mimeType: string;
  documentType: string;
  side?: string;
  virusScanStatus: string;
  uploadedAt: Date;
}

/**
 * Compute SHA-256 hash of a buffer
 */
function computeHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Map document type category to storage folder
 */
function getDocumentCategory(documentType: string): 'kyc' | 'proof_of_address' | 'selfie' {
  switch (documentType) {
    case 'NATIONAL_ID':
    case 'PASSPORT':
    case 'DRIVERS_LICENSE':
      return 'kyc';
    case 'PROOF_OF_ADDRESS':
    case 'UTILITY_BILL':
    case 'BANK_STATEMENT':
      return 'proof_of_address';
    case 'SELFIE_PHOTO':
      return 'selfie';
    default:
      return 'kyc';
  }
}

/**
 * Upload a document with virus scanning and storage
 */
export async function uploadDocument(
  input: UploadDocumentInput
): Promise<UploadDocumentResult> {
  const storage = getStorageService();

  // Validate file size
  if (input.file.length > MAX_FILE_SIZE) {
    throw new FileValidationError(
      `File size ${input.file.length} exceeds maximum ${MAX_FILE_SIZE} bytes`
    );
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(input.mimeType as typeof ALLOWED_MIME_TYPES[number])) {
    throw new FileValidationError(
      `MIME type ${input.mimeType} not allowed. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`
    );
  }

  // Compute file hash
  const hash = computeHash(input.file);

  // Determine storage path
  const category = getDocumentCategory(input.documentType);
  const path = buildUserDocumentPath(input.profileId, category);

  // Prepare metadata
  const metadata: FileMetadata = {
    originalName: input.originalName,
    mimeType: input.mimeType,
    size: input.file.length,
    hash,
    documentType: input.documentType as DocumentType,
    side: input.side as DocumentSide | undefined,
    profileId: input.profileId,
    extra: input.metadata,
  };

  logger.info(
    {
      profileId: input.profileId,
      documentType: input.documentType,
      size: input.file.length,
      mimeType: input.mimeType,
    },
    'Starting document upload'
  );

  try {
    // Upload with virus scanning
    const result: StorageResult = await storage.uploadWithScan(
      input.file,
      path,
      metadata
    );

    // Store document record in database
    const document = await db.kYCDocument.create({
      data: {
        documentType: input.documentType,
        side: input.side,
        storageUrl: result.storageUrl,
        fileHash: result.hash,
        fileSize: result.size,
        mimeType: result.mimeType,
        documentNumber: input.metadata?.documentNumber,
        issuingCountry: input.metadata?.issuingCountry,
        issuedDate: input.metadata?.issuedDate
          ? new Date(input.metadata.issuedDate)
          : undefined,
        expiryDate: input.metadata?.expiryDate
          ? new Date(input.metadata.expiryDate)
          : undefined,
        virusScanStatus: result.virusScanStatus,
        virusScanDate: new Date(),
        uploadedAt: result.uploadedAt,
        // Link to KYC if exists
        kyc: {
          connectOrCreate: {
            where: {
              profileId: input.profileId,
            },
            create: {
              profileId: input.profileId,
              status: 'PENDING',
            },
          },
        },
      },
    });

    logger.info(
      {
        documentId: document.documentId,
        fileId: result.fileId,
        profileId: input.profileId,
      },
      'Document uploaded successfully'
    );

    return {
      documentId: document.documentId,
      fileId: result.fileId,
      storageUrl: result.storageUrl,
      fileName: result.fileName,
      hash: result.hash,
      size: result.size,
      mimeType: result.mimeType,
      documentType: input.documentType,
      side: input.side,
      virusScanStatus: result.virusScanStatus,
      uploadedAt: result.uploadedAt,
    };
  } catch (error) {
    if (error instanceof VirusDetectedError) {
      logger.error(
        {
          profileId: input.profileId,
          virusName: error.virusName,
        },
        'Virus detected in uploaded document'
      );

      // Log security incident
      await (db as any).securityIncident?.create?.({
        data: {
          incidentType: 'VIRUS_DETECTED',
          profileId: input.profileId,
          details: {
            documentType: input.documentType,
            fileName: input.originalName,
            virusName: error.virusName,
          },
        },
      }).catch(() => {
        // SecurityIncident table might not exist yet
      });

      throw error;
    }

    throw error;
  }
}

/**
 * Get documents for a user
 */
export async function getDocumentsByProfileId(
  profileId: string
): Promise<UploadDocumentResult[]> {
  const documents = await db.kYCDocument.findMany({
    where: {
      kyc: {
        profileId,
      },
    },
    orderBy: {
      uploadedAt: 'desc',
    },
  });

  return documents.map((doc: any) => ({
    documentId: doc.documentId,
    fileId: doc.storageUrl.replace('gdrive://', ''),
    storageUrl: doc.storageUrl,
    fileName: '', // Not stored in DB
    hash: doc.fileHash,
    size: doc.fileSize,
    mimeType: doc.mimeType,
    documentType: doc.documentType,
    side: doc.side || undefined,
    virusScanStatus: doc.virusScanStatus,
    uploadedAt: doc.uploadedAt,
  }));
}

/**
 * Get signed URL for document access (admin use)
 */
export async function getDocumentSignedUrl(
  documentId: string,
  expiresInMinutes: number = 15
): Promise<string> {
  const document = await db.kYCDocument.findUnique({
    where: { documentId },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  const storage = getStorageService();
  const fileId = document.storageUrl.replace('gdrive://', '');

  return storage.getProvider().getSignedUrl(fileId, { expiresInMinutes });
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const document = await db.kYCDocument.findUnique({
    where: { documentId },
  });

  if (!document) {
    throw new Error('Document not found');
  }

  const storage = getStorageService();
  const fileId = document.storageUrl.replace('gdrive://', '');

  // Delete from storage
  await storage.getProvider().delete(fileId);

  // Delete from database
  await db.kYCDocument.delete({
    where: { documentId },
  });

  logger.info({ documentId }, 'Document deleted');
}

/**
 * Check if storage service is healthy
 */
export async function checkStorageHealth(): Promise<{
  storage: boolean;
  scanner: boolean;
}> {
  try {
    const storage = getStorageService();
    return await storage.isHealthy();
  } catch {
    return { storage: false, scanner: false };
  }
}
