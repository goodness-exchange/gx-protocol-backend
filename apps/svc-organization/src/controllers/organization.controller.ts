import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { organizationService } from '../services/organization.service';
import type {
  AuthenticatedRequest,
  ProposeOrganizationRequestDTO,
  EndorseMembershipRequestDTO,
  ActivateOrganizationRequestDTO,
  DefineAuthRuleRequestDTO,
  InitiateMultiSigTxRequestDTO,
  ApproveMultiSigTxRequestDTO,
} from '../types/dtos';

class OrganizationController {
  /**
   * POST /api/v1/organizations
   * Propose a new organization
   */
  proposeOrganization = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const data: ProposeOrganizationRequestDTO = req.body;

      if (!data.orgId || !data.orgName || !data.orgType || !data.stakeholderIds) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'orgId, orgName, orgType, and stakeholderIds are required',
        });
        return;
      }

      // Authorization: User must be one of the stakeholders
      if (req.user && !data.stakeholderIds.includes(req.user.profileId)) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You must be a stakeholder to propose an organization',
        });
        return;
      }

      const result = await organizationService.proposeOrganization(data);

      logger.info({ commandId: result.commandId }, 'Organization proposal initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error }, 'Organization proposal failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Organization proposal failed',
      });
    }
  };

  /**
   * POST /api/v1/organizations/:orgId/endorse
   * Endorse membership in an organization
   */
  endorseMembership = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { orgId } = req.params;

      if (!orgId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'orgId is required',
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const data: EndorseMembershipRequestDTO = { orgId };
      const result = await organizationService.endorseMembership(data, req.user.profileId);

      logger.info({ commandId: result.commandId, orgId }, 'Membership endorsement initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error, orgId: req.params.orgId }, 'Membership endorsement failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Membership endorsement failed',
      });
    }
  };

  /**
   * POST /api/v1/organizations/:orgId/activate
   * Activate organization after all endorsements
   */
  activateOrganization = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { orgId } = req.params;

      if (!orgId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'orgId is required',
        });
        return;
      }

      // TODO: Check if user is admin or stakeholder

      const data: ActivateOrganizationRequestDTO = { orgId };
      const result = await organizationService.activateOrganization(data);

      logger.info({ commandId: result.commandId, orgId }, 'Organization activation initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error, orgId: req.params.orgId }, 'Organization activation failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Organization activation failed',
      });
    }
  };

  /**
   * POST /api/v1/organizations/:orgId/rules
   * Define authorization rule for multi-signature transactions
   */
  defineAuthRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { orgId } = req.params;
      const { rule } = req.body;

      if (!orgId || !rule) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'orgId and rule are required',
        });
        return;
      }

      // TODO: Check if user is admin or stakeholder

      const data: DefineAuthRuleRequestDTO = { orgId, rule };
      const result = await organizationService.defineAuthRule(data);

      logger.info({ commandId: result.commandId, orgId }, 'Authorization rule definition initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error, orgId: req.params.orgId }, 'Authorization rule definition failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Authorization rule definition failed',
      });
    }
  };

  /**
   * POST /api/v1/organizations/:orgId/transactions
   * Initiate multi-signature transaction
   */
  initiateMultiSigTx = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { orgId } = req.params;
      const { toUserId, amount, remark } = req.body;

      if (!orgId || !toUserId || !amount) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'orgId, toUserId, and amount are required',
        });
        return;
      }

      if (amount <= 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Amount must be greater than 0',
        });
        return;
      }

      // TODO: Check if user is stakeholder

      const data: InitiateMultiSigTxRequestDTO = { orgId, toUserId, amount, remark };
      const result = await organizationService.initiateMultiSigTx(data);

      logger.info({ commandId: result.commandId, pendingTxId: result.pendingTxId }, 'Multi-sig transaction initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error, orgId: req.params.orgId }, 'Multi-sig transaction initiation failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Multi-sig transaction initiation failed',
      });
    }
  };

  /**
   * POST /api/v1/transactions/:pendingTxId/approve
   * Approve pending multi-signature transaction
   */
  approveMultiSigTx = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { pendingTxId } = req.params;

      if (!pendingTxId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'pendingTxId is required',
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      const data: ApproveMultiSigTxRequestDTO = { pendingTxId };
      const result = await organizationService.approveMultiSigTx(data, req.user.profileId);

      logger.info({ commandId: result.commandId, pendingTxId }, 'Multi-sig approval initiated');

      res.status(202).json(result);
    } catch (error) {
      logger.error({ error, pendingTxId: req.params.pendingTxId }, 'Multi-sig approval failed');

      res.status(400).json({
        error: 'Bad Request',
        message: (error as Error).message || 'Multi-sig approval failed',
      });
    }
  };

  /**
   * GET /api/v1/organizations/:orgId
   * Get organization details
   */
  getOrganization = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { orgId } = req.params;

      if (!orgId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'orgId is required',
        });
        return;
      }

      const organization = await organizationService.getOrganization(orgId);

      res.status(200).json({ organization });
    } catch (error) {
      logger.error({ error, orgId: req.params.orgId }, 'Failed to fetch organization');

      if ((error as Error).message === 'Organization not found') {
        res.status(404).json({
          error: 'Not Found',
          message: 'Organization not found',
        });
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch organization',
      });
    }
  };

  /**
   * GET /api/v1/organizations/:orgId/transactions/pending
   * Get pending multi-signature transactions
   */
  getPendingTransactions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { orgId } = req.params;

      if (!orgId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'orgId is required',
        });
        return;
      }

      const pendingTxs = await organizationService.getPendingTransactions(orgId);

      res.status(200).json({ pendingTransactions: pendingTxs });
    } catch (error) {
      logger.error({ error, orgId: req.params.orgId }, 'Failed to fetch pending transactions');

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch pending transactions',
      });
    }
  };
}

export const organizationController = new OrganizationController();
