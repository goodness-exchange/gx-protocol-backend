/**
 * Storage module type definitions
 */

/**
 * Document type enumeration matching Prisma schema
 */
export enum DocumentType {
  NATIONAL_ID = 'NATIONAL_ID',
  PASSPORT = 'PASSPORT',
  DRIVERS_LICENSE = 'DRIVERS_LICENSE',
  PROOF_OF_ADDRESS = 'PROOF_OF_ADDRESS',
  DEATH_CERTIFICATE = 'DEATH_CERTIFICATE',
  DIVORCE_CERTIFICATE = 'DIVORCE_CERTIFICATE',
  BUSINESS_REGISTRATION = 'BUSINESS_REGISTRATION',
  TAX_REGISTRATION = 'TAX_REGISTRATION',
  BANK_STATEMENT = 'BANK_STATEMENT',
  UTILITY_BILL = 'UTILITY_BILL',
  SELFIE_PHOTO = 'SELFIE_PHOTO',
  OTHER = 'OTHER',
}

/**
 * Document side for multi-page documents (e.g., ID cards)
 */
export enum DocumentSide {
  FRONT = 'FRONT',
  BACK = 'BACK',
}

/**
 * Virus scan status
 */
export enum VirusScanStatus {
  PENDING = 'PENDING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  ERROR = 'ERROR',
}

/**
 * Metadata attached to uploaded files
 */
export interface FileMetadata {
  /** Original file name */
  originalName: string;
  /** MIME type of the file */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** SHA-256 hash of file contents */
  hash: string;
  /** Type of document */
  documentType: DocumentType;
  /** Side of document (for ID cards) */
  side?: DocumentSide;
  /** Profile ID this document belongs to */
  profileId: string;
  /** Additional metadata (document number, expiry, etc.) */
  extra?: Record<string, unknown>;
}

/**
 * Result of a successful file upload
 */
export interface StorageResult {
  /** Unique file identifier from storage provider */
  fileId: string;
  /** Storage URL (e.g., gdrive://fileId) */
  storageUrl: string;
  /** Final file name in storage */
  fileName: string;
  /** File hash for integrity verification */
  hash: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Virus scan result */
  virusScanStatus: VirusScanStatus;
  /** When the file was uploaded */
  uploadedAt: Date;
}

/**
 * Information about a file in storage
 */
export interface FileInfo {
  /** Unique file identifier */
  fileId: string;
  /** File name */
  name: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Last modified timestamp */
  modifiedAt: Date;
  /** Parent folder ID */
  parentId?: string;
}

/**
 * Options for generating signed URLs
 */
export interface SignedUrlOptions {
  /** URL expiration time in minutes (default: 15) */
  expiresInMinutes?: number;
  /** Content disposition (inline or attachment) */
  disposition?: 'inline' | 'attachment';
}

/**
 * Result of a virus scan
 */
export interface VirusScanResult {
  /** Whether the file is clean */
  isClean: boolean;
  /** Virus name if infected */
  virusName?: string;
  /** Detailed scan message */
  message: string;
  /** Scan duration in milliseconds */
  scanDurationMs: number;
}

/**
 * Storage provider configuration
 */
export interface StorageConfig {
  /** Google Drive root folder ID */
  rootFolderId: string;
  /** Service account credentials (JSON string or path) */
  credentials: string | object;
}

/**
 * ClamAV configuration
 */
export interface ClamAVConfig {
  /** ClamAV host */
  host: string;
  /** ClamAV port (default: 3310) */
  port: number;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Whether to bypass scanning (for development) */
  bypassScan?: boolean;
}

/**
 * Abstract storage provider interface
 */
export interface StorageProvider {
  /**
   * Upload a file to storage
   * @param file - File buffer
   * @param path - Destination path (e.g., users/{id}/kyc/)
   * @param metadata - File metadata
   * @returns Storage result with file ID and URL
   */
  upload(
    file: Buffer,
    path: string,
    metadata: FileMetadata
  ): Promise<StorageResult>;

  /**
   * Download a file from storage
   * @param fileId - Unique file identifier
   * @returns File buffer
   */
  download(fileId: string): Promise<Buffer>;

  /**
   * Generate a time-limited access URL
   * @param fileId - Unique file identifier
   * @param options - URL generation options
   * @returns Signed URL string
   */
  getSignedUrl(fileId: string, options?: SignedUrlOptions): Promise<string>;

  /**
   * Delete a file from storage
   * @param fileId - Unique file identifier
   */
  delete(fileId: string): Promise<void>;

  /**
   * List files in a folder
   * @param folderPath - Folder path to list
   * @returns Array of file info objects
   */
  listFiles(folderPath: string): Promise<FileInfo[]>;

  /**
   * Create a folder (creates parent folders if needed)
   * @param path - Folder path to create
   * @returns Folder ID
   */
  createFolder(path: string): Promise<string>;

  /**
   * Check if a file exists
   * @param fileId - Unique file identifier
   * @returns True if file exists
   */
  exists(fileId: string): Promise<boolean>;
}

/**
 * Virus scanner interface
 */
export interface VirusScanner {
  /**
   * Scan a file buffer for viruses
   * @param file - File buffer to scan
   * @returns Scan result
   */
  scan(file: Buffer): Promise<VirusScanResult>;

  /**
   * Check if the scanner is healthy/connected
   * @returns True if scanner is available
   */
  isHealthy(): Promise<boolean>;
}

/**
 * Combined storage service interface
 */
export interface StorageService {
  /**
   * Upload a file with virus scanning
   * @param file - File buffer
   * @param path - Destination path
   * @param metadata - File metadata
   * @returns Storage result
   * @throws Error if virus is detected or upload fails
   */
  uploadWithScan(
    file: Buffer,
    path: string,
    metadata: FileMetadata
  ): Promise<StorageResult>;

  /**
   * Get storage provider instance
   */
  getProvider(): StorageProvider;

  /**
   * Get virus scanner instance
   */
  getScanner(): VirusScanner;
}

/**
 * Allowed MIME types for document uploads
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * Maximum file size in bytes (10MB)
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Default signed URL expiration in minutes
 */
export const DEFAULT_SIGNED_URL_EXPIRY_MINUTES = 15;
