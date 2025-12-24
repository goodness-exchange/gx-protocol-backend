import { Response } from 'express';
import { z } from 'zod';
import { logger } from '@gx/core-logger';
import { AdminAuthenticatedRequest } from '../types/admin-auth.types';
import { deploymentService } from '../services/deployment.service';
import { DeploymentErrorCode, DEPLOYABLE_SERVICES, DeployableService, Environment, DeploymentStatus } from '../types/deployment.types';

// ============================================================================
// Validation Schemas
// ============================================================================

const createDeploymentSchema = z.object({
  service: z.enum(DEPLOYABLE_SERVICES as readonly [string, ...string[]]),
  sourceEnv: z.enum(['devnet', 'testnet']),
  targetEnv: z.enum(['testnet', 'mainnet']),
  imageTag: z.string().min(1).max(50),
  reason: z.string().min(10).max(1000),
});

const listDeploymentsSchema = z.object({
  service: z.enum(DEPLOYABLE_SERVICES as readonly [string, ...string[]]).optional(),
  sourceEnv: z.enum(['devnet', 'testnet', 'mainnet']).optional(),
  targetEnv: z.enum(['devnet', 'testnet', 'mainnet']).optional(),
  status: z.enum([
    'PENDING_APPROVAL',
    'APPROVED',
    'IN_PROGRESS',
    'HEALTH_CHECK',
    'COMPLETED',
    'FAILED',
    'ROLLED_BACK',
    'CANCELLED',
  ]).optional(),
  requestedBy: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const rollbackSchema = z.object({
  reason: z.string().min(10).max(1000),
});

// ============================================================================
// Controller Class
// ============================================================================

class DeploymentController {
  // ==========================================================================
  // Create Deployment Request (Promote)
  // ==========================================================================

  async createDeployment(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const validation = createDeploymentSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid request body',
          details: validation.error.errors,
        });
        return;
      }

      const admin = req.admin!;
      const result = await deploymentService.createDeploymentRequest(admin.adminId, {
        service: validation.data.service as DeployableService,
        sourceEnv: validation.data.sourceEnv as Environment,
        targetEnv: validation.data.targetEnv as Environment,
        imageTag: validation.data.imageTag,
        reason: validation.data.reason,
      });

      logger.info(
        {
          adminId: admin.adminId,
          deploymentId: result.deployment.id,
          service: validation.data.service,
          sourceEnv: validation.data.sourceEnv,
          targetEnv: validation.data.targetEnv,
        },
        'Deployment request created'
      );

      res.status(201).json(result);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // List Deployments
  // ==========================================================================

  async listDeployments(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const validation = listDeploymentsSchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid query parameters',
          details: validation.error.errors,
        });
        return;
      }

      const result = await deploymentService.listDeployments({
        service: validation.data.service as DeployableService | undefined,
        sourceEnv: validation.data.sourceEnv as Environment | undefined,
        targetEnv: validation.data.targetEnv as Environment | undefined,
        status: validation.data.status as DeploymentStatus | undefined,
        requestedBy: validation.data.requestedBy,
        page: validation.data.page,
        limit: validation.data.limit,
      });
      res.json(result);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Get Single Deployment
  // ==========================================================================

  async getDeployment(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Deployment ID is required',
        });
        return;
      }

      const includeLogs = req.query.includeLogs === 'true';
      const deployment = await deploymentService.getDeployment(id, includeLogs);

      res.json(deployment);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Get Deployment Logs
  // ==========================================================================

  async getDeploymentLogs(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Deployment ID is required',
        });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      const logs = await deploymentService.getDeploymentLogs(id, limit, offset);

      res.json(logs);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Execute Deployment (after approval)
  // ==========================================================================

  async executeDeployment(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Deployment ID is required',
        });
        return;
      }

      const admin = req.admin!;

      // Only SUPER_OWNER can execute deployments
      if (admin.role !== 'SUPER_OWNER') {
        res.status(403).json({
          error: 'Forbidden',
          code: DeploymentErrorCode.UNAUTHORIZED,
          message: 'Only SUPER_OWNER can execute deployments',
        });
        return;
      }

      const result = await deploymentService.executeDeployment(id, admin.adminId);

      logger.info(
        { adminId: admin.adminId, deploymentId: id },
        'Deployment execution started'
      );

      res.json(result);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Rollback Deployment
  // ==========================================================================

  async rollbackDeployment(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Deployment ID is required',
        });
        return;
      }

      const validation = rollbackSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Invalid request body',
          details: validation.error.errors,
        });
        return;
      }

      const admin = req.admin!;

      // Only SUPER_OWNER can rollback deployments
      if (admin.role !== 'SUPER_OWNER') {
        res.status(403).json({
          error: 'Forbidden',
          code: DeploymentErrorCode.UNAUTHORIZED,
          message: 'Only SUPER_OWNER can rollback deployments',
        });
        return;
      }

      const result = await deploymentService.rollbackDeployment(id, admin.adminId, validation.data.reason);

      logger.info(
        { adminId: admin.adminId, deploymentId: id, reason: validation.data.reason },
        'Deployment rollback executed'
      );

      res.json(result);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Cancel Deployment
  // ==========================================================================

  async cancelDeployment(req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Deployment ID is required',
        });
        return;
      }

      const admin = req.admin!;
      await deploymentService.cancelDeployment(id, admin.adminId);

      logger.info({ adminId: admin.adminId, deploymentId: id }, 'Deployment cancelled');

      res.json({
        success: true,
        message: 'Deployment cancelled successfully',
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Get Deployable Services
  // ==========================================================================

  async getServices(_req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const services = deploymentService.getDeployableServices();
      res.json({ services });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Get Environments
  // ==========================================================================

  async getEnvironments(_req: AdminAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const environments = deploymentService.getEnvironments();
      res.json({
        environments,
        promotionPaths: [
          { from: 'devnet', to: 'testnet' },
          { from: 'testnet', to: 'mainnet' },
        ],
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  // ==========================================================================
  // Error Handler
  // ==========================================================================

  private handleError(error: unknown, res: Response): void {
    // Check for known error codes
    if (error && typeof error === 'object' && 'code' in error) {
      const err = error as { code: DeploymentErrorCode; message: string };

      switch (err.code) {
        case DeploymentErrorCode.NOT_FOUND:
          res.status(404).json({
            error: 'Not Found',
            code: err.code,
            message: err.message,
          });
          return;

        case DeploymentErrorCode.INVALID_PROMOTION:
        case DeploymentErrorCode.ALREADY_IN_PROGRESS:
        case DeploymentErrorCode.NOT_APPROVED:
        case DeploymentErrorCode.ALREADY_EXECUTED:
        case DeploymentErrorCode.IMAGE_NOT_FOUND:
        case DeploymentErrorCode.PREVIOUS_IMAGE_NOT_AVAILABLE:
          res.status(400).json({
            error: 'Bad Request',
            code: err.code,
            message: err.message,
          });
          return;

        case DeploymentErrorCode.UNAUTHORIZED:
          res.status(403).json({
            error: 'Forbidden',
            code: err.code,
            message: err.message,
          });
          return;

        case DeploymentErrorCode.HEALTH_CHECK_FAILED:
        case DeploymentErrorCode.ROLLBACK_FAILED:
        case DeploymentErrorCode.EXECUTION_FAILED:
          res.status(500).json({
            error: 'Execution Failed',
            code: err.code,
            message: err.message,
          });
          return;
      }
    }

    // Unknown error
    logger.error({ error }, 'Deployment controller error');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
}

export const deploymentController = new DeploymentController();
