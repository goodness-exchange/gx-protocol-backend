#!/usr/bin/env node

import { Command } from 'commander';
import { adminCommand } from './commands/admin';
import { approvalsCommand } from './commands/approvals';
import { setApiUrl } from './utils/config';

// ============================================================================
// GX Protocol CLI
// ============================================================================

const program = new Command();

program
  .name('gx')
  .description('GX Protocol Command Line Interface')
  .version('1.0.0')
  .option('--api-url <url>', 'Override API URL')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.apiUrl) {
      setApiUrl(opts.apiUrl);
    }
  });

// Register command groups
program.addCommand(adminCommand);
program.addCommand(approvalsCommand);

// Config command
program
  .command('config')
  .description('Show or update CLI configuration')
  .option('--api-url <url>', 'Set API URL')
  .option('--show', 'Show current configuration')
  .action((options) => {
    const { getApiUrl, getConfigPath, setApiUrl: setUrl } = require('./utils/config');
    const { output } = require('./utils/output');

    if (options.apiUrl) {
      setUrl(options.apiUrl);
      output.success(`API URL set to: ${options.apiUrl}`);
    }

    if (options.show || !options.apiUrl) {
      output.header('Configuration');
      output.keyValue('API URL', getApiUrl());
      output.keyValue('Config File', getConfigPath());
    }
  });

// Parse and execute
program.parse();
