import { Command } from 'commander';
import { listApprovalsCommand } from './list';
import { createApprovalCommand } from './create';
import { getApprovalCommand, pendingCountCommand } from './get';
import { voteCommand, approveCommand, rejectCommand } from './vote';

// ============================================================================
// Approvals Command Group
// ============================================================================

export const approvalsCommand = new Command('approvals')
  .alias('approval')
  .description('Manage approval requests')
  .addCommand(listApprovalsCommand)
  .addCommand(createApprovalCommand)
  .addCommand(getApprovalCommand)
  .addCommand(pendingCountCommand)
  .addCommand(voteCommand)
  .addCommand(approveCommand)
  .addCommand(rejectCommand);
