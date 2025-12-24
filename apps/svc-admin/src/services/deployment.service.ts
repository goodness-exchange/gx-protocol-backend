import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  DeploymentStatus,
  Environment,
  DeployableService,
  LogLevel,
  CreateDeploymentRequestDTO,
  ListDeploymentsQueryDTO,
  DeploymentRecordDTO,
  DeploymentWithLogsDTO,
  DeploymentListResponseDTO,
  CreateDeploymentResponseDTO,
  ExecuteDeploymentResponseDTO,
  RollbackDeploymentResponseDTO,
  DeploymentLogsResponseDTO,
  BuildArtifacts,
  HealthCheck,
  HealthCheckResults,
  DeploymentMetrics,
  DeploymentErrorCode,
  KubectlResult,
  VALID_PROMOTIONS,
  ENV_NAMESPACE_MAP,
  DEPLOYABLE_SERVICES,
} from '../types/deployment.types';
import { approvalService } from './approval.service';

const execAsync = promisify(exec);

// ============================================================================
// Type Definitions for Prisma Results
// ============================================================================

interface DeploymentLogRecord {
  id: string;
  level: string;
  message: string;
  metadata: unknown;
  source: string | null;
  timestamp: Date;
}

interface DeploymentRecord {
  id: string;
  service: string;
  sourceEnv: string;
  targetEnv: string;
  imageTag: string;
  previousImageTag: string | null;
  gitCommit: string;
  gitBranch: string;
  gitMessage: string | null;
  status: string;
  approvalRequestId: string | null;
  requestedBy: string;
  requestedAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  executedAt: Date | null;
  completedAt: Date | null;
  rolledBackAt: Date | null;
  rollbackReason: string | null;
  buildArtifacts: unknown;
  configDiff: unknown;
  healthCheckResults: unknown;
  preDeployMetrics: unknown;
  postDeployMetrics: unknown;
  errorMessage: string | null;
  errorStack: string | null;
  createdAt: Date;
  updatedAt: Date;
  requester: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
  approver: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  } | null;
  logs?: Array<{
    id: string;
    level: string;
    message: string;
    metadata: unknown;
    source: string | null;
    timestamp: Date;
  }>;
}

// ============================================================================
// Deployment Service
// ============================================================================

class DeploymentService {
  private readonly ROLLOUT_TIMEOUT = 300000; // 5 minutes

  // ==========================================================================
  // Create Deployment Request
  // ==========================================================================

  async createDeploymentRequest(
    requesterId: string,
    data: CreateDeploymentRequestDTO
  ): Promise<CreateDeploymentResponseDTO> {
    logger.info(
      { requesterId, service: data.service, sourceEnv: data.sourceEnv, targetEnv: data.targetEnv },
      'Creating deployment request'
    );

    // Validate service
    if (!DEPLOYABLE_SERVICES.includes(data.service)) {
      throw {
        code: DeploymentErrorCode.INVALID_PROMOTION,
        message: `Invalid service: ${data.service}. Valid services: ${DEPLOYABLE_SERVICES.join(', ')}`,
      };
    }

    // Validate promotion path
    const isValidPromotion = VALID_PROMOTIONS.some(
      (p) => p.from === data.sourceEnv && p.to === data.targetEnv
    );
    if (!isValidPromotion) {
      throw {
        code: DeploymentErrorCode.INVALID_PROMOTION,
        message: `Invalid promotion path: ${data.sourceEnv} -> ${data.targetEnv}. Valid paths: devnet->testnet, testnet->mainnet`,
      };
    }

    // Check for existing in-progress deployment for this service/target
    const existingDeployment = await db.deploymentRecord.findFirst({
      where: {
        service: data.service,
        targetEnv: data.targetEnv,
        status: {
          in: ['PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'HEALTH_CHECK'],
        },
      },
    });

    if (existingDeployment) {
      throw {
        code: DeploymentErrorCode.ALREADY_IN_PROGRESS,
        message: `A deployment for ${data.service} to ${data.targetEnv} is already in progress (ID: ${existingDeployment.id})`,
      };
    }

    // Get current git info
    const gitInfo = await this.getGitInfo();

    // Get current image tag in target environment (for rollback)
    const previousImageTag = await this.getCurrentImageTag(data.service, data.targetEnv);

    // Collect build artifacts
    const buildArtifacts = await this.collectBuildArtifacts(data.service, data.imageTag);

    // Create the deployment record
    const deployment = await db.deploymentRecord.create({
      data: {
        service: data.service,
        sourceEnv: data.sourceEnv,
        targetEnv: data.targetEnv,
        imageTag: data.imageTag,
        previousImageTag,
        gitCommit: gitInfo.commit,
        gitBranch: gitInfo.branch,
        gitMessage: gitInfo.message,
        status: 'PENDING_APPROVAL',
        requestedBy: requesterId,
        buildArtifacts: buildArtifacts as object,
      },
      include: {
        requester: {
          select: { id: true, username: true, displayName: true, role: true },
        },
        approver: {
          select: { id: true, username: true, displayName: true, role: true },
        },
      },
    });

    // Log creation
    await this.addLog(deployment.id, 'info', 'Deployment request created', {
      service: data.service,
      sourceEnv: data.sourceEnv,
      targetEnv: data.targetEnv,
      imageTag: data.imageTag,
    }, 'api');

    // Create approval request
    const approvalRequest = await approvalService.createApprovalRequest(requesterId, {
      requestType: 'DEPLOYMENT_PROMOTION',
      action: `promote:${data.sourceEnv}:${data.targetEnv}`,
      targetResource: data.service,
      payload: {
        deploymentId: deployment.id,
        service: data.service,
        sourceEnv: data.sourceEnv,
        targetEnv: data.targetEnv,
        imageTag: data.imageTag,
        previousImageTag,
        gitCommit: gitInfo.commit,
        gitBranch: gitInfo.branch,
      },
      reason: data.reason,
    });

    // Link approval to deployment
    await db.deploymentRecord.update({
      where: { id: deployment.id },
      data: { approvalRequestId: approvalRequest.id },
    });

    logger.info({ deploymentId: deployment.id, approvalId: approvalRequest.id }, 'Deployment request created');

    return {
      success: true,
      deployment: this.mapToDTO(deployment as DeploymentRecord),
      approvalRequest: {
        id: approvalRequest.id,
        approvalToken: approvalRequest.approvalToken,
        tokenExpiresAt: approvalRequest.tokenExpiresAt ?? undefined,
      },
      message: `Deployment request created. Awaiting SuperOwner approval.`,
    };
  }

  // ==========================================================================
  // List Deployments
  // ==========================================================================

  async listDeployments(query: ListDeploymentsQueryDTO): Promise<DeploymentListResponseDTO> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.service) where.service = query.service;
    if (query.sourceEnv) where.sourceEnv = query.sourceEnv;
    if (query.targetEnv) where.targetEnv = query.targetEnv;
    if (query.status) where.status = query.status;
    if (query.requestedBy) where.requestedBy = query.requestedBy;

    const total = await db.deploymentRecord.count({ where });

    const deployments = await db.deploymentRecord.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        requester: {
          select: { id: true, username: true, displayName: true, role: true },
        },
        approver: {
          select: { id: true, username: true, displayName: true, role: true },
        },
      },
    });

    return {
      deployments: deployments.map((d: DeploymentRecord) => this.mapToDTO(d)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==========================================================================
  // Get Deployment by ID
  // ==========================================================================

  async getDeployment(deploymentId: string, includeLogs = false): Promise<DeploymentWithLogsDTO> {
    const deployment = await db.deploymentRecord.findUnique({
      where: { id: deploymentId },
      include: {
        requester: {
          select: { id: true, username: true, displayName: true, role: true },
        },
        approver: {
          select: { id: true, username: true, displayName: true, role: true },
        },
        logs: includeLogs
          ? {
              orderBy: { timestamp: 'asc' },
              take: 100,
            }
          : false,
      },
    });

    if (!deployment) {
      throw {
        code: DeploymentErrorCode.NOT_FOUND,
        message: 'Deployment not found',
      };
    }

    return this.mapToDTO(deployment as DeploymentRecord, true) as DeploymentWithLogsDTO;
  }

  // ==========================================================================
  // Get Deployment Logs
  // ==========================================================================

  async getDeploymentLogs(
    deploymentId: string,
    limit = 100,
    offset = 0
  ): Promise<DeploymentLogsResponseDTO> {
    const deployment = await db.deploymentRecord.findUnique({
      where: { id: deploymentId },
    });

    if (!deployment) {
      throw {
        code: DeploymentErrorCode.NOT_FOUND,
        message: 'Deployment not found',
      };
    }

    const logs = await db.deploymentLog.findMany({
      where: { deploymentId },
      orderBy: { timestamp: 'desc' },
      skip: offset,
      take: limit,
    });

    const total = await db.deploymentLog.count({ where: { deploymentId } });

    return {
      deploymentId,
      logs: logs.map((l: DeploymentLogRecord) => ({
        id: l.id,
        level: l.level as LogLevel,
        message: l.message,
        metadata: l.metadata as Record<string, unknown> | null,
        source: l.source,
        timestamp: l.timestamp,
      })),
      total,
    };
  }

  // ==========================================================================
  // Execute Deployment (called after approval)
  // ==========================================================================

  async executeDeployment(
    deploymentId: string,
    executorId: string
  ): Promise<ExecuteDeploymentResponseDTO> {
    logger.info({ deploymentId, executorId }, 'Executing deployment');

    const deployment = await db.deploymentRecord.findUnique({
      where: { id: deploymentId },
      include: {
        requester: {
          select: { id: true, username: true, displayName: true, role: true },
        },
        approver: {
          select: { id: true, username: true, displayName: true, role: true },
        },
      },
    });

    if (!deployment) {
      throw {
        code: DeploymentErrorCode.NOT_FOUND,
        message: 'Deployment not found',
      };
    }

    // Check status
    if (deployment.status !== 'APPROVED') {
      throw {
        code: DeploymentErrorCode.NOT_APPROVED,
        message: `Deployment must be in APPROVED status. Current status: ${deployment.status}`,
      };
    }

    // Update status to IN_PROGRESS
    await db.deploymentRecord.update({
      where: { id: deploymentId },
      data: {
        status: 'IN_PROGRESS',
        executedAt: new Date(),
        approvedBy: executorId,
        approvedAt: new Date(),
      },
    });

    await this.addLog(deploymentId, 'info', 'Deployment execution started', { executorId }, 'api');

    // Execute deployment in background
    this.performDeployment(deploymentId).catch((error) => {
      logger.error({ error, deploymentId }, 'Deployment execution failed');
    });

    // Fetch updated deployment
    const updatedDeployment = await db.deploymentRecord.findUnique({
      where: { id: deploymentId },
      include: {
        requester: {
          select: { id: true, username: true, displayName: true, role: true },
        },
        approver: {
          select: { id: true, username: true, displayName: true, role: true },
        },
      },
    });

    return {
      success: true,
      deployment: this.mapToDTO(updatedDeployment as DeploymentRecord),
      message: 'Deployment execution started. Monitor logs for progress.',
    };
  }

  // ==========================================================================
  // Perform Deployment (internal async operation)
  // ==========================================================================

  private async performDeployment(deploymentId: string): Promise<void> {
    try {
      const deployment = await db.deploymentRecord.findUnique({
        where: { id: deploymentId },
      });

      if (!deployment) {
        throw new Error('Deployment not found');
      }

      const namespace = ENV_NAMESPACE_MAP[deployment.targetEnv as Environment];

      // Step 1: Collect pre-deployment metrics
      await this.addLog(deploymentId, 'info', 'Collecting pre-deployment metrics', {}, 'cli');
      const preMetrics = await this.collectMetrics(deployment.service, namespace);
      await db.deploymentRecord.update({
        where: { id: deploymentId },
        data: { preDeployMetrics: preMetrics as object },
      });

      // Step 2: Execute kubectl set image
      await this.addLog(deploymentId, 'info', 'Updating container image', {
        service: deployment.service,
        imageTag: deployment.imageTag,
        namespace,
      }, 'cli');

      const imageFullPath = `registry.gxcoin.money/${deployment.service}:${deployment.imageTag}`;
      const setImageResult = await this.runKubectl(
        `set image deployment/${deployment.service} ${deployment.service}=${imageFullPath} -n ${namespace}`
      );

      if (!setImageResult.success) {
        throw new Error(`Failed to set image: ${setImageResult.stderr}`);
      }

      await this.addLog(deploymentId, 'info', 'Image updated, waiting for rollout', {}, 'cli');

      // Step 3: Wait for rollout
      await db.deploymentRecord.update({
        where: { id: deploymentId },
        data: { status: 'HEALTH_CHECK' },
      });

      const rolloutResult = await this.waitForRollout(deployment.service, namespace);

      if (!rolloutResult.success) {
        throw new Error(`Rollout failed: ${rolloutResult.stderr}`);
      }

      await this.addLog(deploymentId, 'info', 'Rollout completed successfully', {}, 'cli');

      // Step 4: Run health checks
      await this.addLog(deploymentId, 'info', 'Running health checks', {}, 'health-check');
      const healthResults = await this.runHealthChecks(deployment.service, namespace);

      await db.deploymentRecord.update({
        where: { id: deploymentId },
        data: { healthCheckResults: healthResults as object },
      });

      if (!healthResults.passed) {
        await this.addLog(deploymentId, 'error', 'Health checks failed, initiating rollback', {
          checks: healthResults.checks,
        }, 'health-check');

        // Auto-rollback
        await this.performRollback(deploymentId, 'Health checks failed');
        return;
      }

      await this.addLog(deploymentId, 'info', 'Health checks passed', {
        checks: healthResults.checks,
      }, 'health-check');

      // Step 5: Collect post-deployment metrics
      await this.addLog(deploymentId, 'info', 'Collecting post-deployment metrics', {}, 'cli');
      const postMetrics = await this.collectMetrics(deployment.service, namespace);

      // Step 6: Mark as completed
      await db.deploymentRecord.update({
        where: { id: deploymentId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          postDeployMetrics: postMetrics as object,
        },
      });

      await this.addLog(deploymentId, 'info', 'Deployment completed successfully', {
        duration: Date.now() - deployment.requestedAt.getTime(),
      }, 'cli');

      logger.info({ deploymentId }, 'Deployment completed successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      await db.deploymentRecord.update({
        where: { id: deploymentId },
        data: {
          status: 'FAILED',
          errorMessage,
          errorStack,
        },
      });

      await this.addLog(deploymentId, 'error', `Deployment failed: ${errorMessage}`, {
        stack: errorStack,
      }, 'cli');

      logger.error({ error, deploymentId }, 'Deployment failed');

      // Attempt rollback
      try {
        await this.performRollback(deploymentId, errorMessage);
      } catch (rollbackError) {
        logger.error({ error: rollbackError, deploymentId }, 'Rollback also failed');
      }
    }
  }

  // ==========================================================================
  // Manual Rollback
  // ==========================================================================

  async rollbackDeployment(
    deploymentId: string,
    adminId: string,
    reason: string
  ): Promise<RollbackDeploymentResponseDTO> {
    logger.info({ deploymentId, adminId, reason }, 'Manual rollback requested');

    const deployment = await db.deploymentRecord.findUnique({
      where: { id: deploymentId },
      include: {
        requester: {
          select: { id: true, username: true, displayName: true, role: true },
        },
        approver: {
          select: { id: true, username: true, displayName: true, role: true },
        },
      },
    });

    if (!deployment) {
      throw {
        code: DeploymentErrorCode.NOT_FOUND,
        message: 'Deployment not found',
      };
    }

    if (!deployment.previousImageTag) {
      throw {
        code: DeploymentErrorCode.PREVIOUS_IMAGE_NOT_AVAILABLE,
        message: 'No previous image tag available for rollback',
      };
    }

    // Perform rollback
    await this.performRollback(deploymentId, reason);

    // Fetch updated deployment
    const updatedDeployment = await db.deploymentRecord.findUnique({
      where: { id: deploymentId },
      include: {
        requester: {
          select: { id: true, username: true, displayName: true, role: true },
        },
        approver: {
          select: { id: true, username: true, displayName: true, role: true },
        },
      },
    });

    return {
      success: true,
      deployment: this.mapToDTO(updatedDeployment as DeploymentRecord),
      message: 'Rollback completed successfully',
    };
  }

  // ==========================================================================
  // Perform Rollback (internal)
  // ==========================================================================

  private async performRollback(deploymentId: string, reason: string): Promise<void> {
    const deployment = await db.deploymentRecord.findUnique({
      where: { id: deploymentId },
    });

    if (!deployment || !deployment.previousImageTag) {
      throw new Error('Cannot rollback: no previous image tag');
    }

    await this.addLog(deploymentId, 'warn', 'Initiating rollback', { reason }, 'rollback');

    const namespace = ENV_NAMESPACE_MAP[deployment.targetEnv as Environment];
    const imageFullPath = `registry.gxcoin.money/${deployment.service}:${deployment.previousImageTag}`;

    // Set image to previous version
    const setImageResult = await this.runKubectl(
      `set image deployment/${deployment.service} ${deployment.service}=${imageFullPath} -n ${namespace}`
    );

    if (!setImageResult.success) {
      await this.addLog(deploymentId, 'error', 'Rollback failed: could not set image', {
        error: setImageResult.stderr,
      }, 'rollback');
      throw new Error(`Rollback failed: ${setImageResult.stderr}`);
    }

    // Wait for rollout
    const rolloutResult = await this.waitForRollout(deployment.service, namespace);

    if (!rolloutResult.success) {
      await this.addLog(deploymentId, 'error', 'Rollback rollout failed', {
        error: rolloutResult.stderr,
      }, 'rollback');
      throw new Error(`Rollback rollout failed: ${rolloutResult.stderr}`);
    }

    // Update status
    await db.deploymentRecord.update({
      where: { id: deploymentId },
      data: {
        status: 'ROLLED_BACK',
        rolledBackAt: new Date(),
        rollbackReason: reason,
      },
    });

    await this.addLog(deploymentId, 'info', 'Rollback completed successfully', {
      previousImageTag: deployment.previousImageTag,
    }, 'rollback');

    logger.info({ deploymentId, previousImageTag: deployment.previousImageTag }, 'Rollback completed');
  }

  // ==========================================================================
  // Cancel Deployment
  // ==========================================================================

  async cancelDeployment(deploymentId: string, adminId: string): Promise<void> {
    const deployment = await db.deploymentRecord.findUnique({
      where: { id: deploymentId },
    });

    if (!deployment) {
      throw {
        code: DeploymentErrorCode.NOT_FOUND,
        message: 'Deployment not found',
      };
    }

    if (!['PENDING_APPROVAL', 'APPROVED'].includes(deployment.status)) {
      throw {
        code: DeploymentErrorCode.ALREADY_EXECUTED,
        message: `Cannot cancel deployment in ${deployment.status} status`,
      };
    }

    await db.deploymentRecord.update({
      where: { id: deploymentId },
      data: { status: 'CANCELLED' },
    });

    await this.addLog(deploymentId, 'info', 'Deployment cancelled', { cancelledBy: adminId }, 'api');

    logger.info({ deploymentId, adminId }, 'Deployment cancelled');
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async runKubectl(command: string): Promise<KubectlResult> {
    try {
      const { stdout, stderr } = await execAsync(`kubectl ${command}`, {
        timeout: 60000,
      });
      return { success: true, stdout, stderr, exitCode: 0 };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; code?: number };
      return {
        success: false,
        stdout: err.stdout || '',
        stderr: err.stderr || String(error),
        exitCode: err.code || 1,
      };
    }
  }

  private async waitForRollout(service: string, namespace: string): Promise<KubectlResult> {
    try {
      const { stdout, stderr } = await execAsync(
        `kubectl rollout status deployment/${service} -n ${namespace} --timeout=${this.ROLLOUT_TIMEOUT / 1000}s`,
        { timeout: this.ROLLOUT_TIMEOUT + 10000 }
      );
      return { success: true, stdout, stderr, exitCode: 0 };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; code?: number };
      return {
        success: false,
        stdout: err.stdout || '',
        stderr: err.stderr || String(error),
        exitCode: err.code || 1,
      };
    }
  }

  private async runHealthChecks(service: string, namespace: string): Promise<HealthCheckResults> {
    const checks: HealthCheck[] = [];
    const startTime = Date.now();

    // Check 1: Pod readiness
    const podCheck = await this.checkPodReadiness(service, namespace);
    checks.push(podCheck);

    // Check 2: Health endpoint (if pods are ready)
    if (podCheck.passed) {
      const healthEndpointCheck = await this.checkHealthEndpoint(service, namespace);
      checks.push(healthEndpointCheck);
    }

    // Check 3: No restart loops
    const restartCheck = await this.checkNoRestartLoop(service, namespace);
    checks.push(restartCheck);

    const passed = checks.every((c) => c.passed);

    return {
      checks,
      passed,
      totalDuration: Date.now() - startTime,
      completedAt: new Date().toISOString(),
    };
  }

  private async checkPodReadiness(service: string, namespace: string): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const result = await this.runKubectl(
        `get deployment ${service} -n ${namespace} -o jsonpath='{.status.readyReplicas}/{.status.replicas}'`
      );

      if (!result.success) {
        return {
          name: 'Pod Readiness',
          passed: false,
          duration: Date.now() - start,
          message: `Failed to check pods: ${result.stderr}`,
        };
      }

      const [ready, total] = result.stdout.replace(/'/g, '').split('/').map(Number);
      const passed = ready > 0 && ready === total;

      return {
        name: 'Pod Readiness',
        passed,
        duration: Date.now() - start,
        message: passed ? `All pods ready (${ready}/${total})` : `Pods not ready (${ready}/${total})`,
        details: { ready, total },
      };
    } catch (error) {
      return {
        name: 'Pod Readiness',
        passed: false,
        duration: Date.now() - start,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async checkHealthEndpoint(service: string, namespace: string): Promise<HealthCheck> {
    const start = Date.now();
    try {
      // Use kubectl exec to curl the health endpoint from within the cluster
      const result = await this.runKubectl(
        `exec -n ${namespace} deployment/${service} -- curl -sf http://localhost:80/health --max-time 10`
      );

      return {
        name: 'Health Endpoint',
        endpoint: '/health',
        passed: result.success,
        duration: Date.now() - start,
        message: result.success ? 'Health endpoint returned OK' : `Health check failed: ${result.stderr}`,
      };
    } catch (error) {
      return {
        name: 'Health Endpoint',
        endpoint: '/health',
        passed: false,
        duration: Date.now() - start,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async checkNoRestartLoop(service: string, namespace: string): Promise<HealthCheck> {
    const start = Date.now();
    try {
      const result = await this.runKubectl(
        `get pods -n ${namespace} -l app=${service} -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}'`
      );

      if (!result.success) {
        return {
          name: 'Restart Loop Check',
          passed: false,
          duration: Date.now() - start,
          message: `Failed to check restarts: ${result.stderr}`,
        };
      }

      const restarts = result.stdout
        .replace(/'/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .map(Number)
        .reduce((a, b) => a + b, 0);

      const passed = restarts < 3;

      return {
        name: 'Restart Loop Check',
        passed,
        duration: Date.now() - start,
        message: passed ? `No restart loop detected (${restarts} total restarts)` : `Possible restart loop (${restarts} restarts)`,
        details: { totalRestarts: restarts },
      };
    } catch (error) {
      return {
        name: 'Restart Loop Check',
        passed: false,
        duration: Date.now() - start,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async collectMetrics(service: string, namespace: string): Promise<DeploymentMetrics> {
    try {
      const result = await this.runKubectl(
        `get deployment ${service} -n ${namespace} -o json`
      );

      if (!result.success) {
        return {
          replicas: 0,
          readyReplicas: 0,
          availableReplicas: 0,
          timestamp: new Date().toISOString(),
        };
      }

      const deployment = JSON.parse(result.stdout);

      return {
        replicas: deployment.status?.replicas || 0,
        readyReplicas: deployment.status?.readyReplicas || 0,
        availableReplicas: deployment.status?.availableReplicas || 0,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        replicas: 0,
        readyReplicas: 0,
        availableReplicas: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async getCurrentImageTag(service: string, targetEnv: string): Promise<string | null> {
    try {
      const namespace = ENV_NAMESPACE_MAP[targetEnv as Environment];
      const result = await this.runKubectl(
        `get deployment ${service} -n ${namespace} -o jsonpath='{.spec.template.spec.containers[0].image}'`
      );

      if (!result.success) {
        return null;
      }

      // Extract tag from image (e.g., registry.gxcoin.money/svc-identity:2.1.9 -> 2.1.9)
      const image = result.stdout.replace(/'/g, '');
      const parts = image.split(':');
      return parts.length > 1 ? parts[parts.length - 1] : null;
    } catch {
      return null;
    }
  }

  private async getGitInfo(): Promise<{ commit: string; branch: string; message: string }> {
    try {
      const [commitResult, branchResult, messageResult] = await Promise.all([
        execAsync('git rev-parse HEAD', { cwd: '/home/sugxcoin/prod-blockchain/gx-protocol-backend' }),
        execAsync('git rev-parse --abbrev-ref HEAD', { cwd: '/home/sugxcoin/prod-blockchain/gx-protocol-backend' }),
        execAsync('git log -1 --format=%s', { cwd: '/home/sugxcoin/prod-blockchain/gx-protocol-backend' }),
      ]);

      return {
        commit: commitResult.stdout.trim(),
        branch: branchResult.stdout.trim(),
        message: messageResult.stdout.trim(),
      };
    } catch {
      return {
        commit: 'unknown',
        branch: 'unknown',
        message: 'unknown',
      };
    }
  }

  private async collectBuildArtifacts(service: string, imageTag: string): Promise<BuildArtifacts> {
    const dockerImage = `registry.gxcoin.money/${service}:${imageTag}`;

    return {
      dockerImage,
      buildTime: new Date().toISOString(),
    };
  }

  private async addLog(
    deploymentId: string,
    level: LogLevel,
    message: string,
    metadata: Record<string, unknown>,
    source: string
  ): Promise<void> {
    try {
      await db.deploymentLog.create({
        data: {
          deploymentId,
          level,
          message,
          metadata: metadata as object,
          source,
        },
      });
    } catch (error) {
      logger.error({ error, deploymentId }, 'Failed to add deployment log');
    }
  }

  private mapToDTO(deployment: DeploymentRecord, includeLogs = false): DeploymentRecordDTO {
    const dto: DeploymentRecordDTO = {
      id: deployment.id,
      service: deployment.service,
      sourceEnv: deployment.sourceEnv,
      targetEnv: deployment.targetEnv,
      imageTag: deployment.imageTag,
      previousImageTag: deployment.previousImageTag,
      gitCommit: deployment.gitCommit,
      gitBranch: deployment.gitBranch,
      gitMessage: deployment.gitMessage,
      status: deployment.status as DeploymentStatus,
      approvalRequestId: deployment.approvalRequestId,
      requester: {
        id: deployment.requester.id,
        username: deployment.requester.username,
        displayName: deployment.requester.displayName,
        role: deployment.requester.role,
      },
      approver: deployment.approver
        ? {
            id: deployment.approver.id,
            username: deployment.approver.username,
            displayName: deployment.approver.displayName,
            role: deployment.approver.role,
          }
        : null,
      requestedAt: deployment.requestedAt,
      approvedAt: deployment.approvedAt,
      executedAt: deployment.executedAt,
      completedAt: deployment.completedAt,
      rolledBackAt: deployment.rolledBackAt,
      rollbackReason: deployment.rollbackReason,
      buildArtifacts: deployment.buildArtifacts as BuildArtifacts | null,
      configDiff: deployment.configDiff as DeploymentRecordDTO['configDiff'],
      healthCheckResults: deployment.healthCheckResults as HealthCheckResults | null,
      preDeployMetrics: deployment.preDeployMetrics as DeploymentMetrics | null,
      postDeployMetrics: deployment.postDeployMetrics as DeploymentMetrics | null,
      errorMessage: deployment.errorMessage,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
    };

    if (includeLogs && deployment.logs) {
      (dto as DeploymentWithLogsDTO).logs = deployment.logs.map((l: DeploymentLogRecord) => ({
        id: l.id,
        level: l.level as LogLevel,
        message: l.message,
        metadata: l.metadata as Record<string, unknown> | null,
        source: l.source,
        timestamp: l.timestamp,
      }));
    }

    return dto;
  }

  // ==========================================================================
  // Get Deployable Services
  // ==========================================================================

  getDeployableServices(): DeployableService[] {
    return [...DEPLOYABLE_SERVICES];
  }

  // ==========================================================================
  // Get Environments
  // ==========================================================================

  getEnvironments(): Environment[] {
    return ['devnet', 'testnet', 'mainnet'];
  }
}

export const deploymentService = new DeploymentService();
