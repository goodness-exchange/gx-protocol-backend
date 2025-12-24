import crypto from 'crypto';
import { logger } from '@gx/core-logger';
import { messagingConfig } from '../config';

/**
 * Encryption service for message security
 *
 * This provides a simplified encryption layer. In production,
 * this should integrate with a proper Signal Protocol library
 * and HSM for master key management.
 */
class EncryptionService {
  private masterKeyPublic: Buffer | null = null;

  constructor() {
    // In production, fetch master key from HSM
    // For development, generate a placeholder
    if (messagingConfig.masterKeyEnabled) {
      this.initializeMasterKey();
    }
  }

  /**
   * Initialize master key (development mode)
   */
  private async initializeMasterKey(): Promise<void> {
    try {
      // In production, this would fetch from HSM
      // For now, use a derived key from environment
      if (process.env.MASTER_KEY_PUBLIC) {
        this.masterKeyPublic = Buffer.from(process.env.MASTER_KEY_PUBLIC, 'base64');
      } else {
        // Generate development key
        const { publicKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 4096,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        this.masterKeyPublic = Buffer.from(publicKey);
        logger.warn('Using development master key - NOT FOR PRODUCTION');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize master key');
    }
  }

  /**
   * Wrap content for master key escrow
   *
   * This encrypts the content with the master public key so that
   * it can be decrypted by SuperOwner for compliance purposes.
   */
  async wrapForMasterKey(encryptedContent: string): Promise<string> {
    if (!this.masterKeyPublic) {
      throw new Error('Master key not initialized');
    }

    try {
      // Generate a symmetric key for this message
      const symmetricKey = crypto.randomBytes(32);
      const iv = crypto.randomBytes(12);

      // Encrypt content with symmetric key (AES-256-GCM)
      const cipher = crypto.createCipheriv('aes-256-gcm', symmetricKey, iv);
      const encrypted = Buffer.concat([
        cipher.update(encryptedContent, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      // Wrap symmetric key with master public key (RSA-OAEP)
      const wrappedKey = crypto.publicEncrypt(
        {
          key: this.masterKeyPublic,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        symmetricKey
      );

      // Combine all parts
      const combined = Buffer.concat([
        Buffer.from([iv.length]),
        iv,
        Buffer.from([authTag.length]),
        authTag,
        wrappedKey,
        encrypted,
      ]);

      return combined.toString('base64');
    } catch (error) {
      logger.error({ error }, 'Failed to wrap content for master key');
      throw error;
    }
  }

  /**
   * Generate a random encryption key
   */
  generateSymmetricKey(): Buffer {
    return crypto.randomBytes(32);
  }

  /**
   * Generate nonce/IV for encryption
   */
  generateNonce(): Buffer {
    return crypto.randomBytes(12);
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  encrypt(plaintext: Buffer, key: Buffer, nonce: Buffer): { ciphertext: Buffer; authTag: Buffer } {
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return { ciphertext, authTag };
  }

  /**
   * Decrypt data with AES-256-GCM
   */
  decrypt(ciphertext: Buffer, key: Buffer, nonce: Buffer, authTag: Buffer): Buffer {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Hash data with SHA-256
   */
  hash(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate key fingerprint
   */
  fingerprint(key: Buffer): string {
    return this.hash(key).substring(0, 16);
  }
}

export const encryptionService = new EncryptionService();
