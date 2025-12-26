/**
 * Permission Seed Data for Enterprise RBAC System
 *
 * Permission Code Format: module:action:scope
 * - module: The functional area (user, transaction, wallet, etc.)
 * - action: The operation (view, create, update, delete, approve, export)
 * - scope: The reach (own, team, department, all)
 *
 * Example: user:approve:all - Can approve users across all scopes
 */

import { PrismaClient, PermissionCategory, RiskLevel, AdminRole } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// Permission Definitions
// ============================================================================

interface PermissionDefinition {
  code: string;
  name: string;
  description: string;
  category: PermissionCategory;
  riskLevel: RiskLevel;
  requiresMfa: boolean;
  requiresApproval: boolean;
}

const permissions: PermissionDefinition[] = [
  // ============================================================================
  // USER MANAGEMENT PERMISSIONS
  // ============================================================================

  // View permissions
  { code: 'user:view:own', name: 'View Own Users', description: 'View users assigned to you', category: 'USER', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'user:view:team', name: 'View Team Users', description: 'View users within your team', category: 'USER', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'user:view:all', name: 'View All Users', description: 'View all users in the system', category: 'USER', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },

  // Create permissions
  { code: 'user:create:all', name: 'Create Users', description: 'Create new user accounts', category: 'USER', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },

  // Update permissions
  { code: 'user:update:own', name: 'Update Own Users', description: 'Update users assigned to you', category: 'USER', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },
  { code: 'user:update:all', name: 'Update All Users', description: 'Update any user in the system', category: 'USER', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },

  // Approve permissions
  { code: 'user:approve:all', name: 'Approve Users', description: 'Approve user registrations and KYC', category: 'USER', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'user:reject:all', name: 'Reject Users', description: 'Reject user registrations', category: 'USER', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },

  // Freeze/Unfreeze permissions
  { code: 'user:freeze:all', name: 'Freeze Users', description: 'Freeze user accounts', category: 'USER', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'user:unfreeze:all', name: 'Unfreeze Users', description: 'Unfreeze user accounts', category: 'USER', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },

  // Delete permissions
  { code: 'user:delete:all', name: 'Delete Users', description: 'Permanently delete user accounts', category: 'USER', riskLevel: 'CRITICAL', requiresMfa: true, requiresApproval: true },

  // Export permissions
  { code: 'user:export:all', name: 'Export Users', description: 'Export user data to CSV/Excel', category: 'USER', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },

  // Tier management
  { code: 'user:tier:upgrade', name: 'Upgrade User Tier', description: 'Upgrade user account tiers', category: 'USER', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'user:tier:downgrade', name: 'Downgrade User Tier', description: 'Downgrade user account tiers', category: 'USER', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },

  // ============================================================================
  // TRANSACTION MANAGEMENT PERMISSIONS
  // ============================================================================

  { code: 'transaction:view:own', name: 'View Own Transactions', description: 'View transactions you processed', category: 'FINANCIAL', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'transaction:view:all', name: 'View All Transactions', description: 'View all transactions in the system', category: 'FINANCIAL', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'transaction:hold:all', name: 'Hold Transactions', description: 'Put transactions on hold for review', category: 'FINANCIAL', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: false },
  { code: 'transaction:release:all', name: 'Release Transactions', description: 'Release held transactions', category: 'FINANCIAL', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: false },
  { code: 'transaction:reverse:all', name: 'Reverse Transactions', description: 'Reverse completed transactions', category: 'FINANCIAL', riskLevel: 'CRITICAL', requiresMfa: true, requiresApproval: true },
  { code: 'transaction:approve:high', name: 'Approve High-Value Transactions', description: 'Approve transactions above threshold', category: 'FINANCIAL', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: false },
  { code: 'transaction:export:all', name: 'Export Transactions', description: 'Export transaction data', category: 'FINANCIAL', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },
  { code: 'transaction:investigate:all', name: 'Investigate Transactions', description: 'Access full transaction investigation tools', category: 'FINANCIAL', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },

  // ============================================================================
  // WALLET MANAGEMENT PERMISSIONS
  // ============================================================================

  { code: 'wallet:view:all', name: 'View All Wallets', description: 'View all wallet details', category: 'FINANCIAL', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'wallet:freeze:all', name: 'Freeze Wallets', description: 'Freeze wallet functionality', category: 'FINANCIAL', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'wallet:unfreeze:all', name: 'Unfreeze Wallets', description: 'Unfreeze wallets', category: 'FINANCIAL', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'wallet:adjust:all', name: 'Adjust Wallet Balance', description: 'Manually adjust wallet balances', category: 'FINANCIAL', riskLevel: 'CRITICAL', requiresMfa: true, requiresApproval: true },
  { code: 'wallet:limit:set', name: 'Set Wallet Limits', description: 'Configure wallet transaction limits', category: 'FINANCIAL', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },

  // ============================================================================
  // TREASURY PERMISSIONS
  // ============================================================================

  { code: 'treasury:view:all', name: 'View Treasury', description: 'View treasury balances and status', category: 'FINANCIAL', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },
  { code: 'treasury:transfer:internal', name: 'Internal Treasury Transfer', description: 'Transfer between internal accounts', category: 'FINANCIAL', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'treasury:transfer:external', name: 'External Treasury Transfer', description: 'Transfer to external accounts', category: 'FINANCIAL', riskLevel: 'CRITICAL', requiresMfa: true, requiresApproval: true },
  { code: 'treasury:reserve:manage', name: 'Manage Reserves', description: 'Manage reserve requirements', category: 'FINANCIAL', riskLevel: 'CRITICAL', requiresMfa: true, requiresApproval: true },
  { code: 'treasury:fee:configure', name: 'Configure Fees', description: 'Configure fee structures', category: 'FINANCIAL', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'treasury:report:generate', name: 'Generate Treasury Reports', description: 'Generate financial reports', category: 'FINANCIAL', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },

  // ============================================================================
  // COMPLIANCE & AUDIT PERMISSIONS
  // ============================================================================

  { code: 'audit:view:all', name: 'View Audit Logs', description: 'View all audit logs', category: 'AUDIT', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'audit:export:all', name: 'Export Audit Logs', description: 'Export audit logs', category: 'AUDIT', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'audit:search:advanced', name: 'Advanced Audit Search', description: 'Use advanced audit search features', category: 'AUDIT', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'compliance:sar:create', name: 'Create SAR', description: 'Create Suspicious Activity Reports', category: 'AUDIT', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'compliance:sar:submit', name: 'Submit SAR', description: 'Submit SARs to regulators', category: 'AUDIT', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'compliance:ctr:create', name: 'Create CTR', description: 'Create Currency Transaction Reports', category: 'AUDIT', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },
  { code: 'compliance:report:regulatory', name: 'Generate Regulatory Reports', description: 'Generate regulatory compliance reports', category: 'AUDIT', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },
  { code: 'compliance:sanctions:screen', name: 'Sanctions Screening', description: 'Perform sanctions screening', category: 'AUDIT', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },
  { code: 'compliance:pep:manage', name: 'Manage PEP Status', description: 'Manage Politically Exposed Person status', category: 'AUDIT', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: false },

  // ============================================================================
  // SYSTEM ADMINISTRATION PERMISSIONS
  // ============================================================================

  { code: 'system:pause:all', name: 'Pause System', description: 'Pause system operations', category: 'SYSTEM', riskLevel: 'CRITICAL', requiresMfa: true, requiresApproval: true },
  { code: 'system:resume:all', name: 'Resume System', description: 'Resume system operations', category: 'SYSTEM', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: false },
  { code: 'system:maintenance:toggle', name: 'Toggle Maintenance Mode', description: 'Enable/disable maintenance mode', category: 'SYSTEM', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: false },
  { code: 'system:health:view', name: 'View System Health', description: 'View system health metrics', category: 'SYSTEM', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'system:logs:view', name: 'View System Logs', description: 'View application logs', category: 'SYSTEM', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'system:cache:clear', name: 'Clear Cache', description: 'Clear system caches', category: 'SYSTEM', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },

  // ============================================================================
  // CONFIGURATION PERMISSIONS
  // ============================================================================

  { code: 'config:feature:toggle', name: 'Toggle Feature Flags', description: 'Enable/disable feature flags', category: 'CONFIG', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: false },
  { code: 'config:limit:set', name: 'Set Limits', description: 'Configure transaction/daily limits', category: 'CONFIG', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'config:rate:set', name: 'Set Rate Limits', description: 'Configure API rate limits', category: 'CONFIG', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'config:country:manage', name: 'Manage Countries', description: 'Configure supported countries', category: 'CONFIG', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'config:currency:manage', name: 'Manage Currencies', description: 'Configure supported currencies', category: 'CONFIG', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'config:notification:template', name: 'Manage Notification Templates', description: 'Edit notification templates', category: 'CONFIG', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },

  // ============================================================================
  // DEPLOYMENT PERMISSIONS
  // ============================================================================

  { code: 'deployment:view:all', name: 'View Deployments', description: 'View deployment history', category: 'DEPLOYMENT', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'deployment:devnet:deploy', name: 'Deploy to DevNet', description: 'Deploy to development environment', category: 'DEPLOYMENT', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'deployment:testnet:deploy', name: 'Deploy to TestNet', description: 'Deploy to test environment', category: 'DEPLOYMENT', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'deployment:mainnet:deploy', name: 'Deploy to MainNet', description: 'Deploy to production environment', category: 'DEPLOYMENT', riskLevel: 'CRITICAL', requiresMfa: true, requiresApproval: true },
  { code: 'deployment:rollback:all', name: 'Rollback Deployments', description: 'Rollback deployments', category: 'DEPLOYMENT', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: false },
  { code: 'deployment:promote:testnet', name: 'Promote to TestNet', description: 'Promote from DevNet to TestNet', category: 'DEPLOYMENT', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'deployment:promote:mainnet', name: 'Promote to MainNet', description: 'Promote from TestNet to MainNet', category: 'DEPLOYMENT', riskLevel: 'CRITICAL', requiresMfa: true, requiresApproval: true },

  // ============================================================================
  // ADMIN MANAGEMENT PERMISSIONS
  // ============================================================================

  { code: 'admin:view:all', name: 'View Admins', description: 'View all admin accounts', category: 'SYSTEM', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'admin:create:all', name: 'Create Admins', description: 'Create new admin accounts', category: 'SYSTEM', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'admin:update:all', name: 'Update Admins', description: 'Update admin accounts', category: 'SYSTEM', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: false },
  { code: 'admin:delete:all', name: 'Delete Admins', description: 'Delete admin accounts', category: 'SYSTEM', riskLevel: 'CRITICAL', requiresMfa: true, requiresApproval: true },
  { code: 'admin:role:assign', name: 'Assign Roles', description: 'Assign roles to admins', category: 'SYSTEM', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'admin:permission:grant', name: 'Grant Permissions', description: 'Grant custom permissions', category: 'SYSTEM', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'admin:session:revoke', name: 'Revoke Sessions', description: 'Revoke admin sessions', category: 'SYSTEM', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'admin:mfa:reset', name: 'Reset Admin MFA', description: 'Reset MFA for other admins', category: 'SYSTEM', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },

  // ============================================================================
  // ROLE MANAGEMENT PERMISSIONS
  // ============================================================================

  { code: 'role:view:all', name: 'View Roles', description: 'View all roles and their permissions', category: 'SYSTEM', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'role:create:custom', name: 'Create Custom Roles', description: 'Create custom roles', category: 'SYSTEM', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'role:update:all', name: 'Update Roles', description: 'Update role permissions', category: 'SYSTEM', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'role:delete:custom', name: 'Delete Custom Roles', description: 'Delete custom roles', category: 'SYSTEM', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },

  // ============================================================================
  // APPROVAL WORKFLOW PERMISSIONS
  // ============================================================================

  { code: 'approval:view:all', name: 'View All Approvals', description: 'View all approval requests', category: 'SYSTEM', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'approval:view:pending', name: 'View Pending Approvals', description: 'View pending approval requests', category: 'SYSTEM', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'approval:approve:all', name: 'Approve Requests', description: 'Approve workflow requests', category: 'SYSTEM', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: false },
  { code: 'approval:reject:all', name: 'Reject Requests', description: 'Reject workflow requests', category: 'SYSTEM', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'approval:delegate:all', name: 'Delegate Approvals', description: 'Delegate approval authority', category: 'SYSTEM', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },

  // ============================================================================
  // REPORTING PERMISSIONS
  // ============================================================================

  { code: 'report:view:dashboard', name: 'View Dashboard', description: 'View admin dashboard', category: 'AUDIT', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'report:view:analytics', name: 'View Analytics', description: 'View detailed analytics', category: 'AUDIT', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'report:create:custom', name: 'Create Custom Reports', description: 'Create custom reports', category: 'AUDIT', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },
  { code: 'report:schedule:all', name: 'Schedule Reports', description: 'Schedule automatic reports', category: 'AUDIT', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'report:export:sensitive', name: 'Export Sensitive Reports', description: 'Export reports with sensitive data', category: 'AUDIT', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: false },

  // ============================================================================
  // WEBHOOK PERMISSIONS
  // ============================================================================

  { code: 'webhook:view:all', name: 'View Webhooks', description: 'View webhook configurations', category: 'CONFIG', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },
  { code: 'webhook:create:all', name: 'Create Webhooks', description: 'Create new webhooks', category: 'CONFIG', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'webhook:update:all', name: 'Update Webhooks', description: 'Update webhook configurations', category: 'CONFIG', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'webhook:delete:all', name: 'Delete Webhooks', description: 'Delete webhooks', category: 'CONFIG', riskLevel: 'MEDIUM', requiresMfa: true, requiresApproval: false },
  { code: 'webhook:test:all', name: 'Test Webhooks', description: 'Test webhook delivery', category: 'CONFIG', riskLevel: 'LOW', requiresMfa: false, requiresApproval: false },

  // ============================================================================
  // NOTIFICATION PERMISSIONS
  // ============================================================================

  { code: 'notification:send:user', name: 'Send User Notifications', description: 'Send notifications to users', category: 'CONFIG', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },
  { code: 'notification:send:broadcast', name: 'Broadcast Notifications', description: 'Send broadcast notifications', category: 'CONFIG', riskLevel: 'HIGH', requiresMfa: true, requiresApproval: true },
  { code: 'notification:manage:templates', name: 'Manage Templates', description: 'Manage notification templates', category: 'CONFIG', riskLevel: 'MEDIUM', requiresMfa: false, requiresApproval: false },
];

// ============================================================================
// Default Role Permission Mappings
// ============================================================================

const rolePermissions: Record<AdminRole, string[]> = {
  SUPER_OWNER: ['*'], // All permissions

  SUPER_ADMIN: [
    // Full user management
    'user:view:all', 'user:create:all', 'user:update:all', 'user:approve:all', 'user:reject:all',
    'user:freeze:all', 'user:unfreeze:all', 'user:export:all', 'user:tier:upgrade', 'user:tier:downgrade',

    // Full transaction management
    'transaction:view:all', 'transaction:hold:all', 'transaction:release:all', 'transaction:approve:high',
    'transaction:export:all', 'transaction:investigate:all',

    // Full wallet management
    'wallet:view:all', 'wallet:freeze:all', 'wallet:unfreeze:all', 'wallet:limit:set',

    // Treasury view
    'treasury:view:all', 'treasury:report:generate',

    // Full audit access
    'audit:view:all', 'audit:export:all', 'audit:search:advanced',
    'compliance:sar:create', 'compliance:ctr:create', 'compliance:report:regulatory',
    'compliance:sanctions:screen', 'compliance:pep:manage',

    // System administration
    'system:maintenance:toggle', 'system:health:view', 'system:logs:view', 'system:cache:clear',

    // Configuration
    'config:feature:toggle', 'config:limit:set', 'config:rate:set', 'config:notification:template',

    // Deployment
    'deployment:view:all', 'deployment:devnet:deploy', 'deployment:testnet:deploy',
    'deployment:rollback:all', 'deployment:promote:testnet',

    // Admin management (limited)
    'admin:view:all', 'admin:create:all', 'admin:update:all', 'admin:session:revoke',

    // Role viewing
    'role:view:all',

    // Approvals
    'approval:view:all', 'approval:view:pending', 'approval:approve:all', 'approval:reject:all', 'approval:delegate:all',

    // Reports
    'report:view:dashboard', 'report:view:analytics', 'report:create:custom', 'report:schedule:all', 'report:export:sensitive',

    // Webhooks
    'webhook:view:all', 'webhook:create:all', 'webhook:update:all', 'webhook:delete:all', 'webhook:test:all',

    // Notifications
    'notification:send:user', 'notification:send:broadcast', 'notification:manage:templates',
  ],

  ADMIN: [
    // User management
    'user:view:all', 'user:update:own', 'user:approve:all', 'user:reject:all', 'user:export:all',

    // Transaction management
    'transaction:view:all', 'transaction:hold:all', 'transaction:export:all', 'transaction:investigate:all',

    // Wallet view
    'wallet:view:all',

    // Audit
    'audit:view:all', 'audit:search:advanced',
    'compliance:ctr:create', 'compliance:report:regulatory', 'compliance:sanctions:screen',

    // System
    'system:health:view',

    // Deployment
    'deployment:view:all', 'deployment:devnet:deploy',

    // Admin view
    'admin:view:all',

    // Role view
    'role:view:all',

    // Approvals
    'approval:view:pending',

    // Reports
    'report:view:dashboard', 'report:view:analytics', 'report:create:custom',

    // Webhooks
    'webhook:view:all', 'webhook:test:all',

    // Notifications
    'notification:send:user',
  ],

  MODERATOR: [
    // Limited user management
    'user:view:team', 'user:approve:all', 'user:reject:all',

    // Transaction view
    'transaction:view:all',

    // Wallet view
    'wallet:view:all',

    // Basic audit
    'audit:view:all',

    // Reports
    'report:view:dashboard',

    // Notifications
    'notification:send:user',
  ],

  DEVELOPER: [
    // User view only
    'user:view:all',

    // Transaction view
    'transaction:view:all',

    // System
    'system:health:view', 'system:logs:view',

    // Deployment
    'deployment:view:all', 'deployment:devnet:deploy', 'deployment:rollback:all',

    // Webhooks
    'webhook:view:all', 'webhook:create:all', 'webhook:update:all', 'webhook:test:all',
  ],

  AUDITOR: [
    // Read-only user access
    'user:view:all',

    // Read-only transaction access
    'transaction:view:all', 'transaction:export:all',

    // Full audit access
    'audit:view:all', 'audit:export:all', 'audit:search:advanced',
    'compliance:report:regulatory',

    // Reports
    'report:view:dashboard', 'report:view:analytics', 'report:export:sensitive',
  ],
};

// ============================================================================
// Seed Function
// ============================================================================

export async function seedPermissions(): Promise<void> {
  console.log('Seeding permissions...');

  // Upsert all permissions
  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {
        name: perm.name,
        description: perm.description,
        category: perm.category,
        riskLevel: perm.riskLevel,
        requiresMfa: perm.requiresMfa,
        requiresApproval: perm.requiresApproval,
      },
      create: perm,
    });
  }

  console.log(`Seeded ${permissions.length} permissions`);

  // Seed role-permission mappings
  console.log('Seeding role permissions...');

  for (const [role, permCodes] of Object.entries(rolePermissions)) {
    if (permCodes.includes('*')) {
      // SUPER_OWNER gets all permissions
      for (const perm of permissions) {
        const existingPerm = await prisma.permission.findUnique({ where: { code: perm.code } });
        if (existingPerm) {
          await prisma.rolePermission.upsert({
            where: { role_permissionId: { role: role as AdminRole, permissionId: existingPerm.id } },
            update: { canDelegate: true },
            create: { role: role as AdminRole, permissionId: existingPerm.id, canDelegate: true },
          });
        }
      }
    } else {
      for (const permCode of permCodes) {
        const perm = await prisma.permission.findUnique({ where: { code: permCode } });
        if (perm) {
          await prisma.rolePermission.upsert({
            where: { role_permissionId: { role: role as AdminRole, permissionId: perm.id } },
            update: {},
            create: { role: role as AdminRole, permissionId: perm.id, canDelegate: false },
          });
        }
      }
    }
  }

  console.log('Role permissions seeded');
}

// Main execution
if (require.main === module) {
  seedPermissions()
    .then(() => {
      console.log('Seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export { permissions, rolePermissions };
