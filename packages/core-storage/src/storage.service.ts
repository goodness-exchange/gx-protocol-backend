/**
 * Storage Service
 *
 * Combines storage provider with virus scanning for secure file uploads.
 * Provides a unified interface for document management.
 */

import { logger } from '@gx/core-logger';
import type {
  StorageService,
  StorageProvider,
  VirusScanner,
  StorageResult,
  FileMetadata,
  VirusScanStatus,
} from './types.js';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from './types.js';

/**
 * Error thrown when a virus is detected
 */
export class VirusDetectedError extends Error {
  public virusName: string;

  constructor(virusName: string) {
    super(`Virus detected: ${virusName}`);
    this.name = 'VirusDetectedError';
    this.virusName = virusName;
  }
}

/**
 * Error thrown when file validation fails
 */
export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

/**
 * Storage service implementation
 */
export class DocumentStorageService implements StorageService {
  private provider: StorageProvider;
  private scanner: VirusScanner;

  constructor(provider: StorageProvider, scanner: VirusScanner) {
    this.provider = provider;
    this.scanner = scanner;
  }

  /**
   * Validate file before upload
   */
  private validateFile(file: Buffer, metadata: FileMetadata): void {
    // Check file size
    if (file.length > MAX_FILE_SIZE) {
      throw new FileValidationError(
        `File size ${file.length} bytes exceeds maximum of ${MAX_FILE_SIZE} bytes`
      );
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(metadata.mimeType as typeof ALLOWED_MIME_TYPES[number])) {
      throw new FileValidationError(
        `MIME type ${metadata.mimeType} is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
      );
    }

    // Verify hash matches file
    // Note: In production, you might want to compute hash here and compare
    if (!metadata.hash) {
      throw new FileValidationError('File hash is required');
    }
  }

  /**
   * Upload a file with virus scanning
   */
  async uploadWithScan(
    file: Buffer,
    path: string,
    metadata: FileMetadata
  ): Promise<StorageResult> {
    const startTime = Date.now();

    // Validate file
    this.validateFile(file, metadata);

    logger.info(
      {
        path,
        size: file.length,
        mimeType: metadata.mimeType,
        documentType: metadata.documentType,
        profileId: metadata.profileId,
      },
      'Starting file upload with scan'
    );

    // Scan for viruses
    const scanResult = await this.scanner.scan(file);

    if (!scanResult.isClean) {
      logger.warn(
        {
          path,
          virusName: scanResult.virusName,
          profileId: metadata.profileId,
        },
        'Virus detected in uploaded file'
      );

      throw new VirusDetectedError(scanResult.virusName || 'Unknown virus');
    }

    // Upload to storage provider
    const result = await this.provider.upload(file, path, metadata);

    const totalDuration = Date.now() - startTime;

    logger.info(
      {
        fileId: result.fileId,
        path,
        size: result.size,
        scanDurationMs: scanResult.scanDurationMs,
        totalDurationMs: totalDuration,
      },
      'File upload completed'
    );

    return {
      ...result,
      virusScanStatus: 'CLEAN' as VirusScanStatus,
    };
  }

  /**
   * Get storage provider instance
   */
  getProvider(): StorageProvider {
    return this.provider;
  }

  /**
   * Get virus scanner instance
   */
  getScanner(): VirusScanner {
    return this.scanner;
  }

  /**
   * Health check for the storage service
   */
  async isHealthy(): Promise<{ storage: boolean; scanner: boolean }> {
    const [scannerHealthy] = await Promise.all([
      this.scanner.isHealthy(),
      // Could add storage health check here
    ]);

    return {
      storage: true, // Assume storage is healthy if we got this far
      scanner: scannerHealthy,
    };
  }
}

/**
 * Build folder path for user documents
 */
export function buildUserDocumentPath(
  profileId: string,
  documentCategory: 'kyc' | 'proof_of_address' | 'selfie'
): string {
  return `users/${profileId}/${documentCategory}`;
}

/**
 * Build folder path for organization documents
 */
export function buildOrganizationDocumentPath(
  organizationId: string,
  documentCategory: 'registration' | 'tax'
): string {
  return `organizations/${organizationId}/${documentCategory}`;
}

/**
 * Build folder path for relationship documents
 */
export function buildRelationshipDocumentPath(relationshipId: string): string {
  return `relationships/${relationshipId}/status_documents`;
}
