import { Command } from 'commander';
import { api } from '../../utils/api';
import { isLoggedIn } from '../../utils/config';
import { output, formatDate, formatStatus, formatRole } from '../../utils/output';

// ============================================================================
// Types
// ============================================================================

interface ApprovalDetail {
  id: string;
  requestType: string;
  action: string;
  targetResource: string | null;
  payload: Record<string, unknown> | null;
  reason: string;
  status: string;
  requester: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
  approver?: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  } | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  executedAt: string | null;
  executionResult: Record<string, unknown> | null;
  approvalToken?: string;
  tokenExpiresAt?: string | null;
}

// ============================================================================
// Get Approval Command
// ============================================================================

export const getApprovalCommand = new Command('get')
  .description('Get details of an approval request')
  .argument('<approval-id>', 'Approval request ID')
  .option('--json', 'Output as JSON')
  .action(async (approvalId, options) => {
    try {
      if (!isLoggedIn()) {
        output.error('Not logged in. Run: gx admin login');
        process.exit(1);
      }

      const spinner = output.spinner('Loading approval...');

      const result = await api.get<ApprovalDetail>(`/api/v1/admin/approvals/${approvalId}`);

      if (!result.success || !result.data) {
        spinner.fail('Failed to load approval');
        output.error(result.error?.message || 'Unknown error');
        process.exit(1);
      }

      spinner.stop();

      const approval = result.data;

      if (options.json) {
        output.json(approval);
        return;
      }

      output.header('Approval Request Details');
      output.keyValue('ID', approval.id);
      output.keyValue('Status', formatStatus(approval.status));
      output.keyValue('Type', approval.requestType.replace(/_/g, ' '));
      output.keyValue('Action', approval.action);
      if (approval.targetResource) {
        output.keyValue('Target', approval.targetResource);
      }
      output.keyValue('Reason', approval.reason);
      output.blank();

      output.header('Requester');
      output.keyValue('Username', approval.requester.username);
      output.keyValue('Display Name', approval.requester.displayName);
      output.keyValue('Role', formatRole(approval.requester.role));
      output.blank();

      if (approval.approver) {
        output.header('Approver');
        output.keyValue('Username', approval.approver.username);
        output.keyValue('Display Name', approval.approver.displayName);
        output.keyValue('Role', formatRole(approval.approver.role));
        output.blank();
      }

      output.header('Timeline');
      output.keyValue('Created', formatDate(approval.createdAt));
      if (approval.approvedAt) {
        output.keyValue('Approved', formatDate(approval.approvedAt));
      }
      if (approval.rejectedAt) {
        output.keyValue('Rejected', formatDate(approval.rejectedAt));
        if (approval.rejectionReason) {
          output.keyValue('Rejection Reason', approval.rejectionReason);
        }
      }
      if (approval.executedAt) {
        output.keyValue('Executed', formatDate(approval.executedAt));
      }

      if (approval.tokenExpiresAt && approval.status === 'PENDING') {
        const expiresAt = new Date(approval.tokenExpiresAt);
        const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 60000);
        if (expiresIn > 0) {
          output.keyValue('Token Expires In', `${expiresIn} minutes`);
        } else {
          output.keyValue('Token Status', 'Expired');
        }
      }

      if (approval.payload && Object.keys(approval.payload).length > 0) {
        output.blank();
        output.header('Payload');
        output.json(approval.payload);
      }

      if (approval.executionResult && Object.keys(approval.executionResult).length > 0) {
        output.blank();
        output.header('Execution Result');
        output.json(approval.executionResult);
      }

    } catch (error) {
      output.error(error instanceof Error ? error.message : 'Failed to get approval');
      process.exit(1);
    }
  });

// ============================================================================
// Pending Count Command
// ============================================================================

export const pendingCountCommand = new Command('pending')
  .description('Get count of pending approval requests (SUPER_OWNER only)')
  .action(async () => {
    try {
      if (!isLoggedIn()) {
        output.error('Not logged in. Run: gx admin login');
        process.exit(1);
      }

      const result = await api.get<{ pendingCount: number }>('/api/v1/admin/approvals/pending-count');

      if (!result.success || !result.data) {
        output.error(result.error?.message || 'Failed to get pending count');
        process.exit(1);
      }

      const { pendingCount } = result.data;

      if (pendingCount === 0) {
        output.success('No pending approval requests');
      } else {
        output.warn(`${pendingCount} pending approval request${pendingCount > 1 ? 's' : ''}`);
      }

    } catch (error) {
      output.error(error instanceof Error ? error.message : 'Failed to get pending count');
      process.exit(1);
    }
  });
