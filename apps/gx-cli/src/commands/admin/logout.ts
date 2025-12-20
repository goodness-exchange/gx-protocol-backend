import { Command } from 'commander';
import { api } from '../../utils/api';
import { clearCredentials, isLoggedIn, getCredentials } from '../../utils/config';
import { output } from '../../utils/output';

// ============================================================================
// Logout Command
// ============================================================================

export const logoutCommand = new Command('logout')
  .description('Logout from GX Protocol admin panel')
  .option('-a, --all', 'Logout from all sessions')
  .action(async (options) => {
    try {
      if (!isLoggedIn()) {
        output.warn('Not currently logged in');
        process.exit(0);
      }

      const creds = getCredentials();
      const spinner = output.spinner('Logging out...');

      if (options.all) {
        // Logout from all sessions
        const result = await api.post('/api/v1/admin/auth/logout-all');
        if (result.success) {
          clearCredentials();
          spinner.succeed('Logged out from all sessions');
        } else {
          // Even if API fails, clear local credentials
          clearCredentials();
          spinner.fail('Could not logout from all sessions on server');
          output.warn('Local credentials cleared');
        }
      } else {
        // Logout current session
        const result = await api.post('/api/v1/admin/auth/logout');
        if (result.success) {
          clearCredentials();
          spinner.succeed(`Logged out (${creds?.username || 'unknown'})`);
        } else {
          // Even if API fails, clear local credentials
          clearCredentials();
          spinner.fail('Could not logout on server');
          output.warn('Local credentials cleared');
        }
      }

    } catch (error) {
      // Clear credentials even on error
      clearCredentials();
      output.warn('Logged out locally (server unreachable)');
    }
  });
