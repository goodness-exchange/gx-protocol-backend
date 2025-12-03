/**
 * Type declarations for clamscan module
 */

declare module 'clamscan' {
  interface ClamScanOptions {
    removeInfected?: boolean;
    quarantineInfected?: boolean;
    scanLog?: string | null;
    debugMode?: boolean;
    fileList?: string | null;
    scanRecursively?: boolean;
    clamscan?: {
      path?: string;
      db?: string | null;
      scanArchives?: boolean;
      active?: boolean;
    };
    clamdscan?: {
      socket?: string | null;
      host?: string;
      port?: number;
      timeout?: number;
      localFallback?: boolean;
      path?: string;
      configFile?: string | null;
      multiscan?: boolean;
      reloadDb?: boolean;
      active?: boolean;
      bypassTest?: boolean;
    };
    preference?: 'clamdscan' | 'clamscan';
  }

  interface ScanResult {
    isInfected: boolean;
    viruses?: string[];
    file?: string;
  }

  class NodeClam {
    init(options?: ClamScanOptions): Promise<NodeClam>;
    scanStream(stream: NodeJS.ReadableStream): Promise<ScanResult>;
    scanFile(filePath: string): Promise<ScanResult>;
    scanDir(dirPath: string): Promise<ScanResult>;
    getVersion(): Promise<string>;
    isInfected(file: string): Promise<boolean>;
  }

  export = NodeClam;
}
