// ============================================================================
// Deployment Promotion Workflow Types and DTOs
// DevNet -> TestNet -> MainNet deployment tracking with approval gates
// ============================================================================

// ============================================================================
// Enums (mirrors Prisma schema)
// ============================================================================

export type DeploymentStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'HEALTH_CHECK'
  | 'COMPLETED'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'CANCELLED';

export type Environment = 'devnet' | 'testnet' | 'mainnet';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ============================================================================
// Constants
// ============================================================================

export const DEPLOYABLE_SERVICES = [
  'svc-identity',
  'svc-admin',
  'svc-tokenomics',
  'gx-wallet-frontend',
  'outbox-submitter',
  'projector',
] as const;

export type DeployableService = (typeof DEPLOYABLE_SERVICES)[number];

export const ENVIRONMENT_ORDER: Record<Environment, number> = {
  devnet: 0,
  testnet: 1,
  mainnet: 2,
};

export const VALID_PROMOTIONS: Array<{ from: Environment; to: Environment }> = [
  { from: 'devnet', to: 'testnet' },
  { from: 'testnet', to: 'mainnet' },
];

// ============================================================================
// Request DTOs
// ============================================================================

export interface CreateDeploymentRequestDTO {
  service: DeployableService;
  sourceEnv: Environment;
  targetEnv: Environment;
  imageTag: string;
  reason: string;
}

export interface ListDeploymentsQueryDTO {
  service?: DeployableService;
  sourceEnv?: Environment;
  targetEnv?: Environment;
  status?: DeploymentStatus;
  requestedBy?: string;
  page?: number;
  limit?: number;
}

export interface ExecuteDeploymentDTO {
  forceHealthCheck?: boolean;
}

export interface RollbackDeploymentDTO {
  reason: string;
}

// ============================================================================
// Response DTOs
// ============================================================================

export interface AdminUserDTO {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

export interface DeploymentRecordDTO {
  id: string;
  service: string;
  sourceEnv: string;
  targetEnv: string;
  imageTag: string;
  previousImageTag: string | null;

  // Git info
  gitCommit: string;
  gitBranch: string;
  gitMessage: string | null;

  // Status
  status: DeploymentStatus;

  // Approval
  approvalRequestId: string | null;
  requester: AdminUserDTO;
  approver: AdminUserDTO | null;

  // Timestamps
  requestedAt: Date;
  approvedAt: Date | null;
  executedAt: Date | null;
  completedAt: Date | null;
  rolledBackAt: Date | null;
  rollbackReason: string | null;

  // Audit data
  buildArtifacts: BuildArtifacts | null;
  configDiff: ConfigDiff | null;
  healthCheckResults: HealthCheckResults | null;
  preDeployMetrics: DeploymentMetrics | null;
  postDeployMetrics: DeploymentMetrics | null;

  // Error info
  errorMessage: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface DeploymentLogDTO {
  id: string;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  source: string | null;
  timestamp: Date;
}

export interface DeploymentWithLogsDTO extends DeploymentRecordDTO {
  logs: DeploymentLogDTO[];
}

export interface DeploymentListResponseDTO {
  deployments: DeploymentRecordDTO[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateDeploymentResponseDTO {
  success: boolean;
  deployment: DeploymentRecordDTO;
  approvalRequest: {
    id: string;
    approvalToken?: string;
    tokenExpiresAt?: Date;
  };
  message: string;
}

export interface ExecuteDeploymentResponseDTO {
  success: boolean;
  deployment: DeploymentRecordDTO;
  message: string;
}

export interface RollbackDeploymentResponseDTO {
  success: boolean;
  deployment: DeploymentRecordDTO;
  message: string;
}

export interface DeploymentLogsResponseDTO {
  deploymentId: string;
  logs: DeploymentLogDTO[];
  total: number;
}

// ============================================================================
// Audit Data Types
// ============================================================================

export interface BuildArtifacts {
  dockerImage: string;
  imageDigest?: string;
  buildTime: string;
  buildDuration?: number;
  imageSize?: number;
  layers?: number;
  builtBy?: string;
}

export interface ConfigDiff {
  changed: Array<{
    key: string;
    oldValue?: string;
    newValue?: string;
  }>;
  added: Array<{
    key: string;
    value?: string;
  }>;
  removed: Array<{
    key: string;
    value?: string;
  }>;
}

export interface HealthCheck {
  name: string;
  endpoint?: string;
  passed: boolean;
  duration: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface HealthCheckResults {
  checks: HealthCheck[];
  passed: boolean;
  totalDuration: number;
  completedAt: string;
}

export interface DeploymentMetrics {
  replicas: number;
  readyReplicas: number;
  availableReplicas: number;
  cpu?: {
    usage: string;
    limit: string;
  };
  memory?: {
    usage: string;
    limit: string;
  };
  restartCount?: number;
  errorRate?: number;
  timestamp: string;
}

// ============================================================================
// Error Codes
// ============================================================================

export enum DeploymentErrorCode {
  NOT_FOUND = 'DEPLOYMENT_NOT_FOUND',
  INVALID_PROMOTION = 'INVALID_PROMOTION_PATH',
  ALREADY_IN_PROGRESS = 'DEPLOYMENT_ALREADY_IN_PROGRESS',
  NOT_APPROVED = 'DEPLOYMENT_NOT_APPROVED',
  ALREADY_EXECUTED = 'DEPLOYMENT_ALREADY_EXECUTED',
  HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED',
  ROLLBACK_FAILED = 'ROLLBACK_FAILED',
  EXECUTION_FAILED = 'DEPLOYMENT_EXECUTION_FAILED',
  IMAGE_NOT_FOUND = 'IMAGE_NOT_FOUND',
  UNAUTHORIZED = 'DEPLOYMENT_UNAUTHORIZED',
  PREVIOUS_IMAGE_NOT_AVAILABLE = 'PREVIOUS_IMAGE_NOT_AVAILABLE',
}

// ============================================================================
// Internal Types
// ============================================================================

export interface DeploymentExecutionContext {
  deploymentId: string;
  service: string;
  sourceEnv: Environment;
  targetEnv: Environment;
  imageTag: string;
  previousImageTag: string | null;
  gitCommit: string;
  requestedBy: string;
  approvedBy: string;
}

export interface KubectlResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface DeploymentConfig {
  namespace: string;
  deploymentName: string;
  containerName: string;
  healthEndpoint: string;
  healthTimeout: number;
  rolloutTimeout: number;
}

// Environment to namespace mapping
export const ENV_NAMESPACE_MAP: Record<Environment, string> = {
  devnet: 'backend-devnet',
  testnet: 'backend-testnet',
  mainnet: 'backend-mainnet',
};

// Service to deployment config mapping
export const SERVICE_CONFIG: Record<DeployableService, DeploymentConfig> = {
  'svc-identity': {
    namespace: '', // Set dynamically based on environment
    deploymentName: 'svc-identity',
    containerName: 'svc-identity',
    healthEndpoint: '/health',
    healthTimeout: 60000, // 60 seconds
    rolloutTimeout: 300000, // 5 minutes
  },
  'svc-admin': {
    namespace: '',
    deploymentName: 'svc-admin',
    containerName: 'svc-admin',
    healthEndpoint: '/health',
    healthTimeout: 60000,
    rolloutTimeout: 300000,
  },
  'svc-tokenomics': {
    namespace: '',
    deploymentName: 'svc-tokenomics',
    containerName: 'svc-tokenomics',
    healthEndpoint: '/health',
    healthTimeout: 60000,
    rolloutTimeout: 300000,
  },
  'gx-wallet-frontend': {
    namespace: '',
    deploymentName: 'gx-wallet-frontend',
    containerName: 'gx-wallet-frontend',
    healthEndpoint: '/health',
    healthTimeout: 60000,
    rolloutTimeout: 300000,
  },
  'outbox-submitter': {
    namespace: '',
    deploymentName: 'outbox-submitter',
    containerName: 'outbox-submitter',
    healthEndpoint: '/health',
    healthTimeout: 60000,
    rolloutTimeout: 300000,
  },
  'projector': {
    namespace: '',
    deploymentName: 'projector',
    containerName: 'projector',
    healthEndpoint: '/health',
    healthTimeout: 60000,
    rolloutTimeout: 300000,
  },
};
