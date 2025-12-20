import { Command } from 'commander';
import { api } from '../../utils/api';
import { isLoggedIn } from '../../utils/config';
import { output, formatDate, formatStatus, truncate } from '../../utils/output';

// ============================================================================
// Types
// ============================================================================

interface Approval {
  id: string;
  requestType: string;
  action: string;
  reason: string;
  status: string;
  requester: { username: string; role: string };
  approver?: { username: string } | null;
  createdAt: string;
}

interface ListResponse {
  approvals: Approval[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// List Approvals Command
// ============================================================================

export const listApprovalsCommand = new Command('list')
  .alias('ls')
  .description('List approval requests')
  .option('-s, --status <status>', 'Filter by status (PENDING, APPROVED, REJECTED, EXPIRED, CANCELLED)')
  .option('-t, --type <type>', 'Filter by type (DEPLOYMENT_PROMOTION, USER_FREEZE, etc.)')
  .option('-p, --page <page>', 'Page number', '1')
  .option('-l, --limit <limit>', 'Items per page', '20')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      if (!isLoggedIn()) {
        output.error('Not logged in. Run: gx admin login');
        process.exit(1);
      }

      const spinner = output.spinner('Loading approvals...');

      // Build query string
      const params = new URLSearchParams();
      if (options.status) params.append('status', options.status);
      if (options.type) params.append('requestType', options.type);
      params.append('page', options.page);
      params.append('limit', options.limit);

      const result = await api.get<ListResponse>(`/api/v1/admin/approvals?${params.toString()}`);

      if (!result.success || !result.data) {
        spinner.fail('Failed to load approvals');
        output.error(result.error?.message || 'Unknown error');
        process.exit(1);
      }

      spinner.stop();

      const { approvals, pagination } = result.data;

      if (options.json) {
        output.json(result.data);
        return;
      }

      if (approvals.length === 0) {
        output.info('No approval requests found');
        return;
      }

      output.header(`Approval Requests (${pagination.total} total)`);

      const tableData = approvals.map((a) => [
        a.id.substring(0, 8),
        formatStatus(a.status),
        a.requestType.replace(/_/g, ' '),
        truncate(a.action, 25),
        a.requester.username,
        a.approver?.username || '-',
        formatDate(a.createdAt).split(',')[0],
      ]);

      output.table(tableData, ['ID', 'Status', 'Type', 'Action', 'Requester', 'Approver', 'Created']);

      if (pagination.totalPages > 1) {
        output.info(`Page ${pagination.page} of ${pagination.totalPages}`);
      }

    } catch (error) {
      output.error(error instanceof Error ? error.message : 'Failed to list approvals');
      process.exit(1);
    }
  });
