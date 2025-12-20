import { Command } from 'commander';
import { api } from '../../utils/api';
import { isLoggedIn } from '../../utils/config';
import { output, formatDate, formatRole } from '../../utils/output';

// ============================================================================
// Types
// ============================================================================

interface ProfileResponse {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
  mfaEnabled: boolean;
  mfaPrimaryMethod: string | null;
  lastLoginAt: string | null;
  passwordChangedAt: string;
  requirePasswordChange: boolean;
  createdAt: string;
  permissions: string[];
}

// ============================================================================
// Profile Command
// ============================================================================

export const profileCommand = new Command('profile')
  .description('Show current admin profile')
  .option('--json', 'Output as JSON')
  .option('--permissions', 'Show all permissions')
  .action(async (options) => {
    try {
      if (!isLoggedIn()) {
        output.error('Not logged in. Run: gx admin login');
        process.exit(1);
      }

      const spinner = output.spinner('Loading profile...');

      const result = await api.get<ProfileResponse>('/api/v1/admin/auth/profile');

      if (!result.success || !result.data) {
        spinner.fail('Failed to load profile');
        output.error(result.error?.message || 'Unknown error');
        process.exit(1);
      }

      spinner.stop();

      const profile = result.data;

      if (options.json) {
        output.json(profile);
        return;
      }

      output.header('Admin Profile');
      output.keyValue('Username', profile.username);
      output.keyValue('Display Name', profile.displayName);
      output.keyValue('Email', profile.email);
      output.keyValue('Role', formatRole(profile.role));
      output.keyValue('Admin ID', profile.id);
      output.blank();

      output.header('Security');
      output.keyValue('MFA Enabled', profile.mfaEnabled ? 'Yes' : 'No');
      if (profile.mfaEnabled) {
        output.keyValue('MFA Method', profile.mfaPrimaryMethod || 'TOTP');
      }
      output.keyValue('Password Change Required', profile.requirePasswordChange ? 'Yes' : 'No');
      output.keyValue('Password Changed', formatDate(profile.passwordChangedAt));
      output.keyValue('Last Login', profile.lastLoginAt ? formatDate(profile.lastLoginAt) : 'N/A');
      output.keyValue('Account Created', formatDate(profile.createdAt));
      output.blank();

      if (options.permissions) {
        output.header(`Permissions (${profile.permissions.length})`);

        // Group permissions by category
        const grouped: Record<string, string[]> = {};
        for (const perm of profile.permissions) {
          const category = perm.split(':')[0];
          if (!grouped[category]) {
            grouped[category] = [];
          }
          grouped[category].push(perm);
        }

        for (const [category, perms] of Object.entries(grouped).sort()) {
          output.log(`  ${category}:`);
          for (const perm of perms.sort()) {
            output.log(`    - ${perm}`);
          }
        }
      } else {
        output.info(`${profile.permissions.length} permissions. Use --permissions to list all.`);
      }

    } catch (error) {
      output.error(error instanceof Error ? error.message : 'Failed to load profile');
      process.exit(1);
    }
  });
