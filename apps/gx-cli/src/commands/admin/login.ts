import { Command } from 'commander';
import inquirer from 'inquirer';
import { api } from '../../utils/api';
import { setCredentials, clearCredentials, getApiUrl } from '../../utils/config';
import { output } from '../../utils/output';

// ============================================================================
// Types
// ============================================================================

interface LoginResponse {
  success: boolean;
  requiresMfa: boolean;
  mfaMethod?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  admin?: {
    id: string;
    username: string;
    email: string;
    displayName: string;
    role: string;
  };
  mfaToken?: string;
}

interface MfaVerifyResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  admin: {
    id: string;
    username: string;
    email: string;
    displayName: string;
    role: string;
  };
}

// ============================================================================
// Login Command
// ============================================================================

export const loginCommand = new Command('login')
  .description('Login to GX Protocol admin panel')
  .option('-u, --username <username>', 'Admin username')
  .option('-p, --password <password>', 'Admin password')
  .action(async (options) => {
    try {
      output.info(`Connecting to ${getApiUrl()}`);
      output.blank();

      // Get credentials
      let username = options.username;
      let password = options.password;

      if (!username || !password) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Username:',
            when: !username,
            validate: (input: string) => input.length > 0 || 'Username is required',
          },
          {
            type: 'password',
            name: 'password',
            message: 'Password:',
            mask: '*',
            when: !password,
            validate: (input: string) => input.length > 0 || 'Password is required',
          },
        ]);
        username = username || answers.username;
        password = password || answers.password;
      }

      // Attempt login
      const spinner = output.spinner('Authenticating...');

      const result = await api.post<LoginResponse>(
        '/api/v1/admin/auth/login',
        { username, password },
        false
      );

      if (!result.success || !result.data) {
        spinner.fail('Authentication failed');
        output.error(result.error?.message || 'Unknown error');
        process.exit(1);
      }

      const loginData = result.data;

      // Check if MFA is required
      if (loginData.requiresMfa && loginData.mfaToken) {
        spinner.succeed('Password verified');
        output.info(`MFA required (${loginData.mfaMethod || 'TOTP'})`);

        // Prompt for MFA code
        const mfaAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'code',
            message: 'Enter MFA code:',
            validate: (input: string) => /^\d{6}$/.test(input) || 'Enter a 6-digit code',
          },
        ]);

        const mfaSpinner = output.spinner('Verifying MFA...');

        const mfaResult = await api.post<MfaVerifyResponse>(
          '/api/v1/admin/auth/mfa/verify',
          { mfaToken: loginData.mfaToken, code: mfaAnswers.code },
          false
        );

        if (!mfaResult.success || !mfaResult.data) {
          mfaSpinner.fail('MFA verification failed');
          output.error(mfaResult.error?.message || 'Invalid MFA code');
          process.exit(1);
        }

        // Save credentials with MFA verified
        setCredentials({
          accessToken: mfaResult.data.accessToken,
          refreshToken: mfaResult.data.refreshToken,
          expiresAt: Date.now() + mfaResult.data.expiresIn * 1000,
          adminId: mfaResult.data.admin.id,
          username: mfaResult.data.admin.username,
          role: mfaResult.data.admin.role,
          mfaVerified: true,
        });

        mfaSpinner.succeed('MFA verified');
        output.blank();
        output.success(`Logged in as ${mfaResult.data.admin.displayName} (${mfaResult.data.admin.role})`);
      } else if (loginData.accessToken && loginData.admin) {
        // No MFA required, save credentials
        setCredentials({
          accessToken: loginData.accessToken,
          refreshToken: loginData.refreshToken,
          expiresAt: Date.now() + (loginData.expiresIn || 900) * 1000,
          adminId: loginData.admin.id,
          username: loginData.admin.username,
          role: loginData.admin.role,
          mfaVerified: false,
        });

        spinner.succeed('Authenticated');
        output.blank();
        output.success(`Logged in as ${loginData.admin.displayName} (${loginData.admin.role})`);
      } else {
        spinner.fail('Unexpected response');
        output.error('Login response missing required data');
        process.exit(1);
      }

    } catch (error) {
      output.error(error instanceof Error ? error.message : 'Login failed');
      process.exit(1);
    }
  });
