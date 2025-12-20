import chalk from 'chalk';
import { table } from 'table';

// ============================================================================
// Output Utilities
// ============================================================================

export const output = {
  // Success messages
  success(message: string): void {
    console.log(chalk.green('✓'), message);
  },

  // Error messages
  error(message: string): void {
    console.log(chalk.red('✗'), message);
  },

  // Warning messages
  warn(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  },

  // Info messages
  info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  },

  // Plain text
  log(message: string): void {
    console.log(message);
  },

  // Blank line
  blank(): void {
    console.log();
  },

  // Section header
  header(title: string): void {
    console.log();
    console.log(chalk.bold.underline(title));
    console.log();
  },

  // Key-value pair
  keyValue(key: string, value: string | number | boolean | null | undefined): void {
    const displayValue = value === null || value === undefined ? chalk.dim('N/A') : String(value);
    console.log(`  ${chalk.cyan(key + ':')} ${displayValue}`);
  },

  // Table output
  table(data: string[][], headers?: string[]): void {
    const tableData = headers ? [headers, ...data] : data;
    const config = {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│',
        joinBody: '─',
        joinLeft: '├',
        joinRight: '┤',
        joinJoin: '┼',
      },
      drawHorizontalLine: (lineIndex: number, rowCount: number) => {
        return lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount;
      },
    };
    console.log(table(tableData, config));
  },

  // JSON output
  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  },

  // Inline spinner helper (returns spinner control object)
  spinner(message: string): { succeed: (msg?: string) => void; fail: (msg?: string) => void; stop: () => void } {
    const ora = require('ora');
    return ora(message).start();
  },
};

// ============================================================================
// Format Helpers
// ============================================================================

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleString();
}

export function formatRole(role: string): string {
  const colors: Record<string, (s: string) => string> = {
    SUPER_OWNER: chalk.magenta.bold,
    SUPER_ADMIN: chalk.red.bold,
    ADMIN: chalk.yellow,
    MODERATOR: chalk.green,
    DEVELOPER: chalk.cyan,
    AUDITOR: chalk.gray,
  };
  const colorFn = colors[role] || chalk.white;
  return colorFn(role);
}

export function formatStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    PENDING: chalk.yellow,
    APPROVED: chalk.green,
    REJECTED: chalk.red,
    EXPIRED: chalk.gray,
    CANCELLED: chalk.dim,
  };
  const colorFn = colors[status] || chalk.white;
  return colorFn(status);
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
