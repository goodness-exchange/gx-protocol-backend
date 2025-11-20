/**
 * Factory function for creating Fabric client from environment variables
 *
 * 12-Factor App Principle:
 * "Store config in the environment"
 * https://12factor.net/config
 *
 * Why environment variables?
 * - Different per environment (dev/test/prod)
 * - Never committed to Git (security)
 * - Easy to change without code deployment
 *
 * In Kubernetes:
 * - ConfigMap for non-sensitive config (endpoints, names)
 * - Secret for sensitive config (certificates, keys)
 */

import { promises as fs } from 'fs';
import { FabricClient } from './fabric-client';
import { FabricConnectionError } from './errors';
import { FabricConfig } from './types';

/**
 * Environment variable names
 *
 * Convention: PREFIX_CATEGORY_NAME
 * Example: FABRIC_PEER_ENDPOINT
 */
const ENV_VARS = {
  PEER_ENDPOINT: 'FABRIC_PEER_ENDPOINT',
  PEER_TLS_CA_CERT: 'FABRIC_PEER_TLS_CA_CERT',
  PEER_TLS_CA_CERT_PATH: 'FABRIC_PEER_TLS_CA_CERT_PATH',
  MSP_ID: 'FABRIC_MSP_ID',
  CERT_PATH: 'FABRIC_CERT_PATH',
  KEY_PATH: 'FABRIC_KEY_PATH',
  CHANNEL_NAME: 'FABRIC_CHANNEL_NAME',
  CHAINCODE_NAME: 'FABRIC_CHAINCODE_NAME',
  GRPC_KEEPALIVE: 'FABRIC_GRPC_KEEPALIVE',
  GRPC_KEEPALIVE_TIMEOUT: 'FABRIC_GRPC_KEEPALIVE_TIMEOUT',
  GRPC_TLS_SERVER_NAME_OVERRIDE: 'FABRIC_TLS_SERVER_NAME_OVERRIDE',
} as const;

/**
 * Default values (for development)
 *
 * Production values come from Kubernetes ConfigMap/Secret
 */
const DEFAULTS = {
  mspId: 'Org1MSP',
  channelName: 'gxchannel',
  chaincodeName: 'gxtv3',
  grpcKeepAlive: true,
  grpcKeepAliveTimeout: 120000, // 2 minutes
};

/**
 * Create Fabric client from environment variables or explicit config
 *
 * Example environment (Kubernetes production):
 * ```yaml
 * env:
 *   - name: FABRIC_PEER_ENDPOINT
 *     value: "peer0-org1.fabric.svc.cluster.local:7051"
 *   - name: FABRIC_MSP_ID
 *     value: "Org1MSP"
 *   - name: FABRIC_CHANNEL_NAME
 *     value: "gxchannel"
 *   - name: FABRIC_CHAINCODE_NAME
 *     value: "gxtv3"
 *   - name: FABRIC_CERT_PATH
 *     value: "/etc/fabric/cert.pem"
 *   - name: FABRIC_KEY_PATH
 *     value: "/etc/fabric/key.pem"
 *   - name: FABRIC_PEER_TLS_CA_CERT_PATH
 *     value: "/etc/fabric/ca-cert.pem"
 * ```
 *
 * Example with explicit config (multi-identity scenario):
 * ```typescript
 * const client = await createFabricClient({
 *   peerEndpoint: 'localhost:7051',
 *   peerTLSCACert: fs.readFileSync('./ca-cert.pem', 'utf-8'),
 *   certPath: './fabric-wallet/org1-admin/cert.pem',
 *   keyPath: './fabric-wallet/org1-admin/key.pem',
 *   mspId: 'Org1MSP',
 *   channelName: 'gxchannel',
 *   chaincodeName: 'gxtv3',
 * });
 * ```
 */
export async function createFabricClient(config?: FabricConfig): Promise<FabricClient> {
  try {
    // If config provided, use it directly; otherwise load from environment
    const finalConfig = config || await loadConfigFromEnvironment();

    // Create and return client
    return new FabricClient(finalConfig);
  } catch (error: any) {
    throw new FabricConnectionError(
      'Failed to create Fabric client',
      {
        error: error.message,
        missingVars: config ? [] : getMissingRequiredVars(),
      }
    );
  }
}

/**
 * Load Fabric configuration from environment variables
 *
 * Validation:
 * - Required vars must be present
 * - Certificate files must exist
 * - Endpoint must be valid format
 */
async function loadConfigFromEnvironment(): Promise<FabricConfig> {
  // Required environment variables
  const requiredVars = [
    ENV_VARS.PEER_ENDPOINT,
    ENV_VARS.MSP_ID,
    ENV_VARS.CERT_PATH,
    ENV_VARS.KEY_PATH,
  ];

  // Check required vars
  const missing = requiredVars.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  // Load TLS CA certificate
  // Can be provided directly (for ConfigMap) or as file path (for Secret)
  let peerTLSCACert: string;
  if (process.env[ENV_VARS.PEER_TLS_CA_CERT]) {
    peerTLSCACert = process.env[ENV_VARS.PEER_TLS_CA_CERT]!;
  } else if (process.env[ENV_VARS.PEER_TLS_CA_CERT_PATH]) {
    peerTLSCACert = await fs.readFile(
      process.env[ENV_VARS.PEER_TLS_CA_CERT_PATH]!,
      'utf-8'
    );
  } else {
    throw new Error(
      `Either ${ENV_VARS.PEER_TLS_CA_CERT} or ${ENV_VARS.PEER_TLS_CA_CERT_PATH} must be provided`
    );
  }

  // Validate certificate files exist
  const certPath = process.env[ENV_VARS.CERT_PATH]!;
  const keyPath = process.env[ENV_VARS.KEY_PATH]!;

  try {
    await fs.access(certPath);
    await fs.access(keyPath);
  } catch (error) {
    throw new Error(
      `Certificate or key file not found. Cert: ${certPath}, Key: ${keyPath}`
    );
  }

  // Build configuration
  const config: FabricConfig = {
    peerEndpoint: process.env[ENV_VARS.PEER_ENDPOINT]!,
    peerTLSCACert,
    mspId: process.env[ENV_VARS.MSP_ID] || DEFAULTS.mspId,
    certPath,
    keyPath,
    channelName: process.env[ENV_VARS.CHANNEL_NAME] || DEFAULTS.channelName,
    chaincodeName:
      process.env[ENV_VARS.CHAINCODE_NAME] || DEFAULTS.chaincodeName,
    grpc: {
      keepAlive:
        process.env[ENV_VARS.GRPC_KEEPALIVE] === 'true' ||
        DEFAULTS.grpcKeepAlive,
      keepAliveTimeout: process.env[ENV_VARS.GRPC_KEEPALIVE_TIMEOUT]
        ? parseInt(process.env[ENV_VARS.GRPC_KEEPALIVE_TIMEOUT]!, 10)
        : DEFAULTS.grpcKeepAliveTimeout,
      tlsServerNameOverride: process.env[ENV_VARS.GRPC_TLS_SERVER_NAME_OVERRIDE],
    },
  };

  // Log configuration (without sensitive data)
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'core-fabric',
      message: 'Loaded Fabric configuration from environment',
      config: {
        peerEndpoint: config.peerEndpoint,
        mspId: config.mspId,
        channelName: config.channelName,
        chaincodeName: config.chaincodeName,
        certPath: config.certPath,
        keyPath: config.keyPath,
        grpc: config.grpc,
      },
    })
  );

  return config;
}

/**
 * Get list of missing required environment variables (for error messages)
 */
function getMissingRequiredVars(): string[] {
  const requiredVars = [
    ENV_VARS.PEER_ENDPOINT,
    ENV_VARS.MSP_ID,
    ENV_VARS.CERT_PATH,
    ENV_VARS.KEY_PATH,
  ];

  return requiredVars.filter((varName) => !process.env[varName]);
}

/**
 * Validate Fabric configuration
 *
 * Checks:
 * - Endpoint format (host:port)
 * - MSP ID format
 * - Channel name format (alphanumeric)
 * - Chaincode name format (alphanumeric)
 */
export function validateConfig(config: FabricConfig): void {
  // Validate peer endpoint format
  const endpointRegex = /^[a-zA-Z0-9.-]+:\d+$/;
  if (!endpointRegex.test(config.peerEndpoint)) {
    throw new Error(
      `Invalid peer endpoint format: ${config.peerEndpoint}. Expected format: host:port`
    );
  }

  // Validate MSP ID format (alphanumeric + underscores)
  const mspIdRegex = /^[a-zA-Z0-9_]+$/;
  if (!mspIdRegex.test(config.mspId)) {
    throw new Error(
      `Invalid MSP ID format: ${config.mspId}. Must be alphanumeric with underscores.`
    );
  }

  // Validate channel name (lowercase alphanumeric + hyphens)
  const channelRegex = /^[a-z0-9-]+$/;
  if (!channelRegex.test(config.channelName)) {
    throw new Error(
      `Invalid channel name: ${config.channelName}. Must be lowercase alphanumeric with hyphens.`
    );
  }

  // Validate chaincode name
  const chaincodeRegex = /^[a-zA-Z0-9_-]+$/;
  if (!chaincodeRegex.test(config.chaincodeName)) {
    throw new Error(
      `Invalid chaincode name: ${config.chaincodeName}. Must be alphanumeric with underscores/hyphens.`
    );
  }
}
