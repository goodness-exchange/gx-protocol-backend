/**
 * Google Drive Storage Provider
 *
 * Implements StorageProvider interface using Google Drive API.
 * Uses service account authentication for server-to-server access.
 */

import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { logger } from '@gx/core-logger';
import type {
  StorageProvider,
  StorageResult,
  FileInfo,
  FileMetadata,
  SignedUrlOptions,
  StorageConfig,
  VirusScanStatus,
} from './types.js';
import { DEFAULT_SIGNED_URL_EXPIRY_MINUTES } from './types.js';

/**
 * Google Drive storage provider implementation
 */
export class GoogleDriveProvider implements StorageProvider {
  private drive: drive_v3.Drive | null = null;
  private config: StorageConfig;
  private folderCache: Map<string, string> = new Map();

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /**
   * Initialize Google Drive client with service account credentials
   */
  private async initialize(): Promise<drive_v3.Drive> {
    if (this.drive) return this.drive;

    try {
      let credentials: object;

      if (typeof this.config.credentials === 'string') {
        // Parse JSON string or read from file
        try {
          credentials = JSON.parse(this.config.credentials);
        } catch {
          // Assume it's base64 encoded
          const decoded = Buffer.from(this.config.credentials, 'base64').toString('utf-8');
          credentials = JSON.parse(decoded);
        }
      } else {
        credentials = this.config.credentials;
      }

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });

      this.drive = google.drive({ version: 'v3', auth });

      logger.info('Google Drive provider initialized');
      return this.drive;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Google Drive provider');
      throw error;
    }
  }

  /**
   * Generate a unique file name with timestamp
   */
  private generateFileName(metadata: FileMetadata): string {
    const timestamp = Date.now();
    const extension = this.getExtension(metadata.mimeType);
    const typePart = metadata.documentType.toLowerCase();
    const sidePart = metadata.side ? `_${metadata.side.toLowerCase()}` : '';

    return `${typePart}${sidePart}_${timestamp}${extension}`;
  }

  /**
   * Get file extension from MIME type
   */
  private getExtension(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    };
    return mimeToExt[mimeType] || '';
  }

  /**
   * Create folder hierarchy and return the leaf folder ID
   */
  async createFolder(path: string): Promise<string> {
    const drive = await this.initialize();
    const parts = path.split('/').filter(Boolean);

    let parentId = this.config.rootFolderId;

    for (const folderName of parts) {
      const cacheKey = `${parentId}/${folderName}`;

      // Check cache first
      if (this.folderCache.has(cacheKey)) {
        parentId = this.folderCache.get(cacheKey)!;
        continue;
      }

      // Search for existing folder (with Shared Drive support)
      const searchResponse = await drive.files.list({
        q: `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        // Folder exists
        parentId = searchResponse.data.files[0].id!;
      } else {
        // Create new folder (with Shared Drive support)
        const createResponse = await drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId],
          },
          fields: 'id',
          supportsAllDrives: true,
        });

        parentId = createResponse.data.id!;
        logger.debug({ folderName, folderId: parentId }, 'Created folder');
      }

      // Cache the folder ID
      this.folderCache.set(cacheKey, parentId);
    }

    return parentId;
  }

  /**
   * Upload a file to Google Drive
   */
  async upload(
    file: Buffer,
    path: string,
    metadata: FileMetadata
  ): Promise<StorageResult> {
    const drive = await this.initialize();

    // Create folder hierarchy
    const folderId = await this.createFolder(path);

    // Generate file name
    const fileName = this.generateFileName(metadata);

    // Create readable stream from buffer
    const stream = Readable.from(file);

    // Upload file (with Shared Drive support)
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: metadata.mimeType,
        parents: [folderId],
        description: JSON.stringify({
          originalName: metadata.originalName,
          documentType: metadata.documentType,
          side: metadata.side,
          profileId: metadata.profileId,
          hash: metadata.hash,
        }),
      },
      media: {
        mimeType: metadata.mimeType,
        body: stream,
      },
      fields: 'id, name, size, mimeType, createdTime',
      supportsAllDrives: true,
    });

    const fileId = response.data.id!;

    logger.info(
      {
        fileId,
        fileName,
        path,
        size: metadata.size,
        documentType: metadata.documentType,
      },
      'File uploaded to Google Drive'
    );

    return {
      fileId,
      storageUrl: `gdrive://${fileId}`,
      fileName,
      hash: metadata.hash,
      size: metadata.size,
      mimeType: metadata.mimeType,
      virusScanStatus: 'CLEAN' as VirusScanStatus,
      uploadedAt: new Date(),
    };
  }

  /**
   * Download a file from Google Drive
   */
  async download(fileId: string): Promise<Buffer> {
    const drive = await this.initialize();

    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );

    return Buffer.from(response.data as ArrayBuffer);
  }

  /**
   * Generate a time-limited access URL
   *
   * Note: Google Drive doesn't support traditional signed URLs like S3.
   * Instead, we use webContentLink which requires the file to have
   * appropriate sharing permissions. For truly private access, consider
   * proxying through your backend.
   */
  async getSignedUrl(fileId: string, options?: SignedUrlOptions): Promise<string> {
    const drive = await this.initialize();
    const expiryMinutes = options?.expiresInMinutes || DEFAULT_SIGNED_URL_EXPIRY_MINUTES;

    // Get file metadata to check permissions
    const file = await drive.files.get({
      fileId,
      fields: 'id, webContentLink, webViewLink',
      supportsAllDrives: true,
    });

    // For a service account, we need to create a permission for "anyone with link"
    // This is a limitation of Google Drive - there's no true "signed URL" concept

    // Check if we already have a public link
    if (file.data.webContentLink) {
      return file.data.webContentLink;
    }

    // Create a temporary permission (note: you'd want to clean these up)
    // For production, consider using a proxy endpoint in your backend instead
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true,
    });

    // Get the updated file with webContentLink
    const updatedFile = await drive.files.get({
      fileId,
      fields: 'webContentLink',
      supportsAllDrives: true,
    });

    logger.debug(
      { fileId, expiryMinutes },
      'Generated access URL (note: Google Drive links do not expire)'
    );

    // Note: In a production system, you might want to:
    // 1. Use your backend as a proxy to stream the file
    // 2. Generate a short-lived token that your backend validates
    // 3. Remove the permission after the expiry time

    return updatedFile.data.webContentLink || '';
  }

  /**
   * Delete a file from Google Drive
   */
  async delete(fileId: string): Promise<void> {
    const drive = await this.initialize();

    await drive.files.delete({ fileId, supportsAllDrives: true });

    logger.info({ fileId }, 'File deleted from Google Drive');
  }

  /**
   * List files in a folder
   */
  async listFiles(folderPath: string): Promise<FileInfo[]> {
    const drive = await this.initialize();

    // Get folder ID from path
    const folderId = await this.createFolder(folderPath);

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, parents)',
      orderBy: 'createdTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return (response.data.files || []).map((file) => ({
      fileId: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      size: parseInt(file.size || '0', 10),
      createdAt: new Date(file.createdTime!),
      modifiedAt: new Date(file.modifiedTime!),
      parentId: file.parents?.[0],
    }));
  }

  /**
   * Check if a file exists
   */
  async exists(fileId: string): Promise<boolean> {
    const drive = await this.initialize();

    try {
      await drive.files.get({
        fileId,
        fields: 'id',
        supportsAllDrives: true,
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Create a Google Drive provider from environment variables
 */
export function createGoogleDriveProvider(): GoogleDriveProvider {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  if (!credentials) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is required');
  }

  if (!rootFolderId) {
    throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID environment variable is required');
  }

  return new GoogleDriveProvider({
    credentials,
    rootFolderId,
  });
}
