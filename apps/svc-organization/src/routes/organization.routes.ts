import { Router } from 'express';
import { organizationController } from '../controllers/organization.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Organization Routes
 *
 * Handles organization operations including proposals, endorsements,
 * multi-signature transactions, and authorization rules.
 * All write operations use the CQRS outbox pattern.
 */

const router = Router();

/**
 * POST /api/v1/organizations
 * Propose a new organization
 * Requires authentication (user must be a stakeholder)
 *
 * @body {orgId: string, orgName: string, orgType: string, stakeholderIds: string[]}
 * @returns {commandId: string, message: string}
 */
router.post('/organizations', authenticateJWT, organizationController.proposeOrganization);

/**
 * POST /api/v1/organizations/:orgId/endorse
 * Endorse membership in an organization
 * Requires authentication (user must be a stakeholder)
 *
 * @param orgId - Organization ID
 * @returns {commandId: string, message: string}
 */
router.post('/organizations/:orgId/endorse', authenticateJWT, organizationController.endorseMembership);

/**
 * POST /api/v1/organizations/:orgId/activate
 * Activate organization after all endorsements
 * Requires authentication (admin or stakeholder)
 *
 * @param orgId - Organization ID
 * @returns {commandId: string, message: string}
 */
router.post('/organizations/:orgId/activate', authenticateJWT, organizationController.activateOrganization);

/**
 * POST /api/v1/organizations/:orgId/rules
 * Define authorization rule for multi-signature transactions
 * Requires authentication (admin or stakeholder)
 *
 * @param orgId - Organization ID
 * @body {rule: AuthorizationRule}
 * @returns {commandId: string, message: string}
 */
router.post('/organizations/:orgId/rules', authenticateJWT, organizationController.defineAuthRule);

/**
 * POST /api/v1/organizations/:orgId/transactions
 * Initiate multi-signature transaction
 * Requires authentication (stakeholder)
 *
 * @param orgId - Organization ID
 * @body {toUserId: string, amount: number, remark?: string}
 * @returns {commandId: string, pendingTxId: string, message: string}
 */
router.post('/organizations/:orgId/transactions', authenticateJWT, organizationController.initiateMultiSigTx);

/**
 * POST /api/v1/transactions/:pendingTxId/approve
 * Approve pending multi-signature transaction
 * Requires authentication (approver)
 *
 * @param pendingTxId - Pending transaction ID
 * @returns {commandId: string, message: string}
 */
router.post('/transactions/:pendingTxId/approve', authenticateJWT, organizationController.approveMultiSigTx);

/**
 * GET /api/v1/organizations/:orgId
 * Get organization details
 *
 * @param orgId - Organization ID
 * @returns {organization: OrganizationDTO}
 */
router.get('/organizations/:orgId', organizationController.getOrganization);

/**
 * GET /api/v1/organizations/:orgId/transactions/pending
 * Get pending multi-signature transactions
 *
 * @param orgId - Organization ID
 * @returns {pendingTransactions: PendingTransactionDTO[]}
 */
router.get('/organizations/:orgId/transactions/pending', organizationController.getPendingTransactions);

export default router;
