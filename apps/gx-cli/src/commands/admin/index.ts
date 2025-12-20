import { Command } from 'commander';
import { loginCommand } from './login';
import { logoutCommand } from './logout';
import { profileCommand } from './profile';
import { statusCommand } from './status';

// ============================================================================
// Admin Command Group
// ============================================================================

export const adminCommand = new Command('admin')
  .description('Admin authentication and profile management')
  .addCommand(loginCommand)
  .addCommand(logoutCommand)
  .addCommand(profileCommand)
  .addCommand(statusCommand);
