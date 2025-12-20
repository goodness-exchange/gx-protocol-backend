import { Command } from 'commander';
import inquirer from 'inquirer';
import { api } from '../../utils/api';
import { isLoggedIn } from '../../utils/config';
import { output, formatStatus } from '../../utils/output';

// ============================================================================
// Types
// ============================================================================

const APPROVAL_TYPES = [
  'DEPLOYMENT_PROMOTION',
  'USER_FREEZE',
  'TREASURY_OPERATION',
  'SYSTEM_PAUSE',
  'CONFIG_CHANGE',
  'ADMIN_ROLE_CHANGE',
] as const;

interface CreateResponse {
  success: boolean;
  approval: {
    id: string;
    requestType: string;
    action: string;
    status: string;
    approvalToken?: string;
    tokenExpiresAt?: string;
  };
  message: string;
}

// ============================================================================
// Create Approval Command
// ============================================================================

export const createApprovalCommand = new Command('create')
  .description('Create a new approval request')
  .option('-t, --type <type>', 'Request type')
  .option('-a, --action <action>', 'Action description')
  .option('-r, --reason <reason>', 'Reason for request')
  .option('--target <resource>', 'Target resource')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      if (!isLoggedIn()) {
        output.error('Not logged in. Run: gx admin login');
        process.exit(1);
      }

      // Interactive mode if options not provided
      let requestType = options.type;
      let action = options.action;
      let reason = options.reason;
      let targetResource = options.target;

      if (!requestType || !action || !reason) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'requestType',
            message: 'Request type:',
            choices: APPROVAL_TYPES.map((t) => ({ name: t.replace(/_/g, ' '), value: t })),
            when: !requestType,
          },
          {
            type: 'input',
            name: 'action',
            message: 'Action (e.g., promote:testnet:mainnet):',
            when: !action,
            validate: (input: string) => input.length > 0 || 'Action is required',
          },
          {
            type: 'input',
            name: 'targetResource',
            message: 'Target resource (optional):',
            when: !targetResource,
          },
          {
            type: 'input',
            name: 'reason',
            message: 'Reason (min 10 chars):',
            when: !reason,
            validate: (input: string) => input.length >= 10 || 'Reason must be at least 10 characters',
          },
        ]);

        requestType = requestType || answers.requestType;
        action = action || answers.action;
        reason = reason || answers.reason;
        targetResource = targetResource || answers.targetResource;
      }

      const spinner = output.spinner('Creating approval request...');

      const body: Record<string, unknown> = {
        requestType,
        action,
        reason,
      };
      if (targetResource) {
        body.targetResource = targetResource;
      }

      const result = await api.post<CreateResponse>('/api/v1/admin/approvals', body);

      if (!result.success || !result.data) {
        spinner.fail('Failed to create approval request');
        output.error(result.error?.message || 'Unknown error');
        process.exit(1);
      }

      spinner.succeed('Approval request created');

      if (options.json) {
        output.json(result.data);
        return;
      }

      const { approval } = result.data;

      output.blank();
      output.header('Approval Request Created');
      output.keyValue('Request ID', approval.id);
      output.keyValue('Type', approval.requestType);
      output.keyValue('Action', approval.action);
      output.keyValue('Status', formatStatus(approval.status));
      output.blank();

      if (approval.tokenExpiresAt) {
        const expiresAt = new Date(approval.tokenExpiresAt);
        const expiresIn = Math.floor((expiresAt.getTime() - Date.now()) / 60000);
        output.info(`Token expires in ${expiresIn} minutes`);
      }

      output.info('Awaiting SUPER_OWNER approval');

    } catch (error) {
      output.error(error instanceof Error ? error.message : 'Failed to create approval');
      process.exit(1);
    }
  });
