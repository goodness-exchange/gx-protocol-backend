import { Command } from 'commander';
import inquirer from 'inquirer';
import { api } from '../../utils/api';
import { isLoggedIn } from '../../utils/config';
import { output, formatStatus } from '../../utils/output';

// ============================================================================
// Types
// ============================================================================

interface VoteResponse {
  success: boolean;
  approval: {
    id: string;
    requestType: string;
    action: string;
    status: string;
    approvedAt?: string;
    rejectedAt?: string;
    rejectionReason?: string;
  };
  message: string;
}

// ============================================================================
// Vote Command (Approve/Reject)
// ============================================================================

export const voteCommand = new Command('vote')
  .description('Approve or reject an approval request (SUPER_OWNER only)')
  .argument('<approval-id>', 'Approval request ID')
  .option('-d, --decision <decision>', 'APPROVE or REJECT')
  .option('-r, --reason <reason>', 'Reason (required for rejection)')
  .option('--json', 'Output as JSON')
  .action(async (approvalId, options) => {
    try {
      if (!isLoggedIn()) {
        output.error('Not logged in. Run: gx admin login');
        process.exit(1);
      }

      // Get decision interactively if not provided
      let decision = options.decision?.toUpperCase();
      let reason = options.reason;

      if (!decision) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'decision',
            message: 'Decision:',
            choices: [
              { name: 'Approve', value: 'APPROVE' },
              { name: 'Reject', value: 'REJECT' },
            ],
          },
          {
            type: 'input',
            name: 'reason',
            message: 'Reason:',
            when: (ans) => ans.decision === 'REJECT' && !reason,
            validate: (input: string) => input.length > 0 || 'Reason is required for rejection',
          },
        ]);

        decision = answers.decision;
        reason = reason || answers.reason;
      }

      if (decision !== 'APPROVE' && decision !== 'REJECT') {
        output.error('Decision must be APPROVE or REJECT');
        process.exit(1);
      }

      if (decision === 'REJECT' && !reason) {
        const { rejectionReason } = await inquirer.prompt([
          {
            type: 'input',
            name: 'rejectionReason',
            message: 'Rejection reason:',
            validate: (input: string) => input.length > 0 || 'Reason is required for rejection',
          },
        ]);
        reason = rejectionReason;
      }

      const spinner = output.spinner(`${decision === 'APPROVE' ? 'Approving' : 'Rejecting'}...`);

      const body: Record<string, unknown> = { decision };
      if (reason) {
        body.reason = reason;
      }

      const result = await api.post<VoteResponse>(`/api/v1/admin/approvals/${approvalId}/vote`, body);

      if (!result.success || !result.data) {
        spinner.fail(`Failed to ${decision.toLowerCase()}`);
        output.error(result.error?.message || 'Unknown error');
        process.exit(1);
      }

      spinner.succeed(`Request ${decision.toLowerCase()}d`);

      if (options.json) {
        output.json(result.data);
        return;
      }

      const { approval } = result.data;
      output.blank();
      output.keyValue('Request ID', approval.id);
      output.keyValue('Status', formatStatus(approval.status));
      if (approval.rejectionReason) {
        output.keyValue('Reason', approval.rejectionReason);
      }

    } catch (error) {
      output.error(error instanceof Error ? error.message : 'Vote failed');
      process.exit(1);
    }
  });

// ============================================================================
// Approve Command (shortcut)
// ============================================================================

export const approveCommand = new Command('approve')
  .description('Approve an approval request (SUPER_OWNER only)')
  .argument('<approval-id>', 'Approval request ID')
  .option('-r, --reason <reason>', 'Optional reason')
  .option('--json', 'Output as JSON')
  .action(async (approvalId, options) => {
    options.decision = 'APPROVE';
    await voteCommand.parseAsync(['node', 'vote', approvalId, '-d', 'APPROVE', ...(options.reason ? ['-r', options.reason] : []), ...(options.json ? ['--json'] : [])]);
  });

// ============================================================================
// Reject Command (shortcut)
// ============================================================================

export const rejectCommand = new Command('reject')
  .description('Reject an approval request (SUPER_OWNER only)')
  .argument('<approval-id>', 'Approval request ID')
  .option('-r, --reason <reason>', 'Rejection reason (required)')
  .option('--json', 'Output as JSON')
  .action(async (approvalId, options) => {
    options.decision = 'REJECT';
    await voteCommand.parseAsync(['node', 'vote', approvalId, '-d', 'REJECT', ...(options.reason ? ['-r', options.reason] : []), ...(options.json ? ['--json'] : [])]);
  });
