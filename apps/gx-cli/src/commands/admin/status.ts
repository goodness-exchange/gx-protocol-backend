import { Command } from 'commander';
import { isLoggedIn, getCredentials, getApiUrl, getConfigPath } from '../../utils/config';
import { output, formatRole } from '../../utils/output';

// ============================================================================
// Status Command
// ============================================================================

export const statusCommand = new Command('status')
  .description('Show current login status')
  .action(async () => {
    try {
      output.header('GX CLI Status');

      output.keyValue('API URL', getApiUrl());
      output.keyValue('Config File', getConfigPath());
      output.blank();

      if (!isLoggedIn()) {
        output.keyValue('Status', 'Not logged in');
        output.blank();
        output.info('Run "gx admin login" to authenticate');
        return;
      }

      const creds = getCredentials();
      if (!creds) {
        output.keyValue('Status', 'Not logged in');
        return;
      }

      output.keyValue('Status', 'Logged in');
      output.keyValue('Username', creds.username || 'Unknown');
      output.keyValue('Role', creds.role ? formatRole(creds.role) : 'Unknown');
      output.keyValue('Admin ID', creds.adminId || 'Unknown');
      output.keyValue('MFA Verified', creds.mfaVerified ? 'Yes' : 'No');

      if (creds.expiresAt) {
        const expiresIn = Math.floor((creds.expiresAt - Date.now()) / 1000);
        if (expiresIn > 0) {
          const minutes = Math.floor(expiresIn / 60);
          const seconds = expiresIn % 60;
          output.keyValue('Token Expires In', `${minutes}m ${seconds}s`);
        } else {
          output.keyValue('Token Status', 'Expired (will auto-refresh)');
        }
      }

    } catch (error) {
      output.error(error instanceof Error ? error.message : 'Failed to get status');
      process.exit(1);
    }
  });
