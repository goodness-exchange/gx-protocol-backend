/**
 * Core Storage Package
 *
 * Provides document storage abstraction with Google Drive provider
 * and ClamAV virus scanning integration.
 *
 * @packageDocumentation
 */

// Import and re-export types
export {
  DocumentType,
  DocumentSide,
  VirusScanStatus,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  DEFAULT_SIGNED_URL_EXPIRY_MINUTES,
  type FileMetadata,
  type StorageResult,
  type FileInfo,
  type SignedUrlOptions,
  type VirusScanResult,
  type StorageConfig,
  type ClamAVConfig,
  type StorageProvider,
  type VirusScanner,
  type StorageService,
  type AllowedMimeType,
} from './types.js';

// Import and re-export Google Drive Provider
import {
  GoogleDriveProvider,
  createGoogleDriveProvider,
} from './google-drive.provider.js';
export { GoogleDriveProvider, createGoogleDriveProvider };

// Import and re-export Virus Scanner
import { ClamAVScanner, createClamAVScanner } from './virus-scanner.js';
export { ClamAVScanner, createClamAVScanner };

// Import and re-export Storage Service
import {
  DocumentStorageService,
  VirusDetectedError,
  FileValidationError,
  buildUserDocumentPath,
  buildOrganizationDocumentPath,
  buildRelationshipDocumentPath,
} from './storage.service.js';
export {
  DocumentStorageService,
  VirusDetectedError,
  FileValidationError,
  buildUserDocumentPath,
  buildOrganizationDocumentPath,
  buildRelationshipDocumentPath,
};

/**
 * Create a fully configured storage service from environment variables
 *
 * Required environment variables:
 * - GOOGLE_SERVICE_ACCOUNT_KEY: Base64 encoded service account JSON
 * - GOOGLE_DRIVE_ROOT_FOLDER_ID: ID of the root folder in Google Drive
 * - CLAMAV_HOST: ClamAV daemon host (default: clamav.backend-mainnet.svc.cluster.local)
 * - CLAMAV_PORT: ClamAV daemon port (default: 3310)
 *
 * Optional environment variables:
 * - CLAMAV_TIMEOUT: Scan timeout in milliseconds (default: 60000)
 * - CLAMAV_BYPASS: Set to 'true' to skip virus scanning (development only)
 */
export function createStorageService(): DocumentStorageService {
  const provider = createGoogleDriveProvider();
  const scanner = createClamAVScanner();

  return new DocumentStorageService(provider, scanner);
}
