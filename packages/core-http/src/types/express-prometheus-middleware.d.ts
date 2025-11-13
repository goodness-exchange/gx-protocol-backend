// Type definitions for express-prometheus-middleware
declare module 'express-prometheus-middleware' {
  import { RequestHandler } from 'express';

  interface Options {
    metricsPath?: string;
    collectDefaultMetrics?: boolean;
    requestDurationBuckets?: number[];
    requestLengthBuckets?: number[];
    responseLengthBuckets?: number[];
    prefix?: string;
    customLabels?: string[]; // Array of additional label names
    normalizePath?: Array<[string, string]>;
    authenticate?: (req: any) => boolean;
  }

  function promMiddleware(options?: Options): RequestHandler;

  export = promMiddleware;
}
