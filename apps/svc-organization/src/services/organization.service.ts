import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import type {
  ProposeOrganizationRequestDTO,
  EndorseMembershipRequestDTO,
  ActivateOrganizationRequestDTO,
  DefineAuthRuleRequestDTO,
  InitiateMultiSigTxRequestDTO,
  ApproveMultiSigTxRequestDTO,
  OrganizationDTO,
  PendingTransactionDTO,
} from '../types/dtos';

/**
 * Organization Service
 *
 * Handles organization-related business logic including:
 * - Organization proposals and endorsements (CQRS write via outbox)
 * - Multi-signature authorization rules (CQRS write via outbox)
 * - Multi-signature transactions (CQRS write via outbox)
 * - Organization queries (read from Organization table)
 */

class OrganizationService {
  /**
   * Propose a new organization
   *
   * CQRS Write Operation:
   * 1. Validate organization data
   * 2. Verify all stakeholders exist
   * 3. Create OutboxCommand for "PROPOSE_ORGANIZATION"
   * 4. Outbox-submitter submits to OrganizationContract:ProposeOrganization
   * 5. Fabric emits OrganizationProposed event
   * 6. Projector updates Organization table
   */
  async proposeOrganization(
    data: ProposeOrganizationRequestDTO
  ): Promise<{ commandId: string; message: string }> {
    const { orgId, orgName, orgType, stakeholderIds } = data;

    logger.info({ orgId, orgName, orgType, stakeholderCount: stakeholderIds.length }, 'Proposing new organization');

    // Validate organization data
    if (!orgId || !orgName || !orgType) {
      throw new Error('orgId, orgName, and orgType are required');
    }

    if (stakeholderIds.length === 0) {
      throw new Error('At least one stakeholder is required');
    }

    // Verify all stakeholders exist in the system
    const existingStakeholders = await db.userProfile.findMany({
      where: {
        profileId: { in: stakeholderIds },
        deletedAt: null,
      },
      select: { profileId: true },
    });

    if (existingStakeholders.length !== stakeholderIds.length) {
      const foundIds = existingStakeholders.map((s) => s.profileId);
      const missingIds = stakeholderIds.filter((id) => !foundIds.includes(id));
      throw new Error(`Some stakeholders not found: ${missingIds.join(', ')}`);
    }

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-organization',
        requestId: `propose-org-${orgId}-${Date.now()}`,
        commandType: 'PROPOSE_ORGANIZATION',
        payload: {
          orgId,
          orgName,
          orgType,
          stakeholderIds,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id }, 'Organization proposal command created');

    return {
      commandId: command.id,
      message: 'Organization proposal initiated. All stakeholders must endorse.',
    };
  }

  /**
   * Endorse membership in an organization
   *
   * CQRS Write Operation:
   * Stakeholders endorse their membership before organization activation
   */
  async endorseMembership(
    data: EndorseMembershipRequestDTO,
    userId: string
  ): Promise<{ commandId: string; message: string }> {
    const { orgId } = data;

    logger.info({ orgId, userId }, 'Endorsing organization membership');

    // TODO: Verify organization exists and user is a stakeholder (optional pre-check)

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-organization',
        requestId: `endorse-${orgId}-${userId}-${Date.now()}`,
        commandType: 'ENDORSE_MEMBERSHIP',
        payload: {
          orgId,
          userId,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id }, 'Membership endorsement command created');

    return {
      commandId: command.id,
      message: 'Membership endorsement initiated.',
    };
  }

  /**
   * Activate organization after all stakeholders endorse
   *
   * CQRS Write Operation:
   * Admin or stakeholder activates organization after all endorsements
   */
  async activateOrganization(
    data: ActivateOrganizationRequestDTO
  ): Promise<{ commandId: string; message: string }> {
    const { orgId } = data;

    logger.info({ orgId }, 'Activating organization');

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-organization',
        requestId: `activate-org-${orgId}-${Date.now()}`,
        commandType: 'ACTIVATE_ORGANIZATION',
        payload: {
          orgId,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id }, 'Organization activation command created');

    return {
      commandId: command.id,
      message: 'Organization activation initiated.',
    };
  }

  /**
   * Define authorization rule for multi-signature transactions
   *
   * CQRS Write Operation:
   * Sets threshold and approver group for different transaction amounts
   */
  async defineAuthRule(
    data: DefineAuthRuleRequestDTO
  ): Promise<{ commandId: string; message: string }> {
    const { orgId, rule } = data;

    logger.info({ orgId, rule }, 'Defining authorization rule');

    // Validate rule
    if (rule.requiredApprovers < 1) {
      throw new Error('requiredApprovers must be at least 1');
    }

    if (rule.approverGroup.length < rule.requiredApprovers) {
      throw new Error('approverGroup must have at least as many members as requiredApprovers');
    }

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-organization',
        requestId: `define-rule-${orgId}-${Date.now()}`,
        commandType: 'DEFINE_AUTH_RULE',
        payload: {
          orgId,
          rule,
        } as any,
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id }, 'Authorization rule definition command created');

    return {
      commandId: command.id,
      message: 'Authorization rule definition initiated.',
    };
  }

  /**
   * Initiate multi-signature transaction
   *
   * CQRS Write Operation:
   * Creates a pending transaction requiring approvals from stakeholders
   */
  async initiateMultiSigTx(
    data: InitiateMultiSigTxRequestDTO
  ): Promise<{ commandId: string; pendingTxId: string; message: string }> {
    const { orgId, toUserId, amount, remark } = data;

    logger.info({ orgId, toUserId, amount }, 'Initiating multi-signature transaction');

    // Validate amount
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Generate pending transaction ID
    const pendingTxId = `multisig-${orgId}-${Date.now()}`;

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-organization',
        requestId: pendingTxId,
        commandType: 'INITIATE_MULTISIG_TX',
        payload: {
          orgId,
          toUserId,
          amount: amount.toString(),  // String for precision
          remark: remark || '',
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id, pendingTxId }, 'Multi-signature transaction command created');

    return {
      commandId: command.id,
      pendingTxId,
      message: 'Multi-signature transaction initiated. Waiting for approvals.',
    };
  }

  /**
   * Approve pending multi-signature transaction
   *
   * CQRS Write Operation:
   * Stakeholder approves a pending multi-sig transaction
   */
  async approveMultiSigTx(
    data: ApproveMultiSigTxRequestDTO,
    userId: string
  ): Promise<{ commandId: string; message: string }> {
    const { pendingTxId } = data;

    logger.info({ pendingTxId, userId }, 'Approving multi-signature transaction');

    // Create outbox command
    const command = await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        service: 'svc-organization',
        requestId: `approve-${pendingTxId}-${userId}-${Date.now()}`,
        commandType: 'APPROVE_MULTISIG_TX',
        payload: {
          pendingTxId,
          userId,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({ commandId: command.id }, 'Multi-signature approval command created');

    return {
      commandId: command.id,
      message: 'Multi-signature transaction approval initiated.',
    };
  }

  /**
   * Get organization details
   *
   * CQRS Read Operation: Queries projected Organization table
   */
  async getOrganization(orgId: string): Promise<OrganizationDTO> {
    const organization = await db.organization.findUnique({
      where: { orgId },
    });

    if (!organization) {
      throw new Error('Organization not found');
    }

    const org = organization as any;
    return {
      orgId: org.orgId,
      orgName: org.orgName,
      accountType: org.accountType as 'BUSINESS' | 'NGO' | 'GOVERNMENT',
      status: org.status as 'PendingEndorsement' | 'Verified' | 'Locked',
      stakeholders: org.stakeholders as string[],
      endorsements: org.endorsements as Record<string, boolean>,
      rules: org.rules as any[],
      createdAt: org.createdAt,
      velocityTaxTimerStart: org.velocityTaxTimerStart || undefined,
      velocityTaxLastCheck: org.velocityTaxLastCheck || undefined,
      velocityTaxExempt: org.velocityTaxExempt || undefined,
    };
  }

  /**
   * Get pending multi-signature transactions for an organization
   *
   * CQRS Read Operation: Queries projected PendingTransaction table
   */
  async getPendingTransactions(orgId: string): Promise<PendingTransactionDTO[]> {
    const pendingTxs = await db.multiSigTransaction.findMany({
      where: {
        orgId,
        status: 'Pending',
      },
      orderBy: { createdAt: 'desc' },
    });

    return pendingTxs.map((tx: any) => ({
      txId: tx.txId,
      orgId: tx.orgId,
      toId: tx.toId,
      amount: Number(tx.amount),
      remark: tx.remark || '',
      status: tx.status as 'Pending' | 'Executed' | 'Rejected',
      requiredApprovals: tx.requiredApprovals,
      approverGroup: tx.approverGroup as string[],
      approvals: tx.approvals as Record<string, boolean>,
    }));
  }
}

export const organizationService = new OrganizationService();
