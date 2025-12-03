/**
 * ClamAV Virus Scanner Integration
 *
 * Scans uploaded files for malware using ClamAV daemon.
 * ClamAV must be running as a service (clamd) accessible via TCP.
 */

import NodeClam from 'clamscan';
import { Readable } from 'stream';
import { logger } from '@gx/core-logger';
import type { VirusScanner, VirusScanResult, ClamAVConfig } from './types.js';

/**
 * ClamAV-based virus scanner implementation
 */
export class ClamAVScanner implements VirusScanner {
  private clam: NodeClam | null = null;
  private config: ClamAVConfig;
  private initPromise: Promise<void> | null = null;

  constructor(config: ClamAVConfig) {
    this.config = config;
  }

  /**
   * Initialize ClamAV connection
   */
  private async initialize(): Promise<void> {
    if (this.clam) return;

    // Prevent multiple simultaneous initializations
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      try {
        this.clam = await new NodeClam().init({
          removeInfected: false,
          quarantineInfected: false,
          scanLog: null,
          debugMode: false,
          fileList: null,
          scanRecursively: false,
          clamscan: {
            path: '/usr/bin/clamscan',
            db: null,
            scanArchives: true,
            active: false, // Use clamd instead
          },
          clamdscan: {
            socket: null,
            host: this.config.host,
            port: this.config.port,
            timeout: this.config.timeout || 60000,
            localFallback: false,
            path: '/usr/bin/clamdscan',
            configFile: null,
            multiscan: false,
            reloadDb: false,
            active: true,
            bypassTest: false,
          },
          preference: 'clamdscan',
        });

        logger.info(
          { host: this.config.host, port: this.config.port },
          'ClamAV scanner initialized'
        );
      } catch (error) {
        logger.error({ error }, 'Failed to initialize ClamAV scanner');
        throw error;
      }
    })();

    await this.initPromise;
  }

  /**
   * Scan a file buffer for viruses
   */
  async scan(file: Buffer): Promise<VirusScanResult> {
    const startTime = Date.now();

    // Bypass scanning if configured (for development)
    if (this.config.bypassScan) {
      logger.warn('Virus scanning bypassed - development mode');
      return {
        isClean: true,
        message: 'Scan bypassed (development mode)',
        scanDurationMs: Date.now() - startTime,
      };
    }

    try {
      await this.initialize();

      if (!this.clam) {
        throw new Error('ClamAV not initialized');
      }

      // Create readable stream from buffer
      const stream = Readable.from(file);

      // Scan the stream
      const result = await this.clam.scanStream(stream);

      const scanDurationMs = Date.now() - startTime;

      if (result.isInfected) {
        const virusName = result.viruses?.[0] || 'Unknown';
        logger.warn(
          { virusName, scanDurationMs },
          'Virus detected in uploaded file'
        );

        return {
          isClean: false,
          virusName,
          message: `Virus detected: ${virusName}`,
          scanDurationMs,
        };
      }

      logger.debug({ scanDurationMs }, 'File scan completed - clean');

      return {
        isClean: true,
        message: 'No threats detected',
        scanDurationMs,
      };
    } catch (error) {
      const scanDurationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      logger.error(
        { error: errorMessage, scanDurationMs },
        'Virus scan failed'
      );

      // Return error status but don't throw - let caller decide how to handle
      return {
        isClean: false,
        message: `Scan error: ${errorMessage}`,
        scanDurationMs,
      };
    }
  }

  /**
   * Check if ClamAV is healthy and connected
   */
  async isHealthy(): Promise<boolean> {
    if (this.config.bypassScan) {
      return true;
    }

    try {
      await this.initialize();

      if (!this.clam) {
        return false;
      }

      // Try to get version to verify connection
      const version = await this.clam.getVersion();
      logger.debug({ version }, 'ClamAV health check passed');
      return true;
    } catch (error) {
      logger.warn({ error }, 'ClamAV health check failed');
      return false;
    }
  }
}

/**
 * Create a ClamAV scanner instance from environment variables
 */
export function createClamAVScanner(): ClamAVScanner {
  const host = process.env.CLAMAV_HOST || 'clamav.backend-mainnet.svc.cluster.local';
  const port = parseInt(process.env.CLAMAV_PORT || '3310', 10);
  const timeout = parseInt(process.env.CLAMAV_TIMEOUT || '60000', 10);
  const bypassScan = process.env.CLAMAV_BYPASS === 'true';

  return new ClamAVScanner({
    host,
    port,
    timeout,
    bypassScan,
  });
}
