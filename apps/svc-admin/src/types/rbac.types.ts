/**
 * RBAC Types for Enterprise Role-Based Access Control
 */

import { AdminRole } from './admin-auth.types';

// Re-export permission category and risk level types (match Prisma schema)
export type PermissionCategory = 'SYSTEM' | 'USER' | 'FINANCIAL' | 'DEPLOYMENT' | 'AUDIT' | 'CONFIG';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ============================================================================
// Permission DTOs
// ============================================================================

export interface PermissionDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: PermissionCategory;
  riskLevel: RiskLevel;
  requiresMfa: boolean;
  requiresApproval: boolean;
}

export interface PermissionListResponseDTO {
  permissions: PermissionDTO[];
  total: number;
  byCategory: Record<string, PermissionDTO[]>;
}

// ============================================================================
// Role DTOs
// ============================================================================

export interface RoleDTO {
  role: AdminRole;
  displayName: string;
  level: number;
  isSystemRole: boolean;
  permissionCount: number;
}

export interface RoleDetailDTO extends RoleDTO {
  permissions: PermissionDTO[];
}

export interface RoleListResponseDTO {
  roles: RoleDTO[];
}

// ============================================================================
// Admin Permission DTOs
// ============================================================================

export interface AdminPermissionSummaryDTO {
  admin: {
    id: string;
    username: string;
    displayName: string;
    role: AdminRole;
  };
  rolePermissions: PermissionDTO[];
  customPermissions: PermissionDTO[];
  effectivePermissions: PermissionDTO[];
  permissionsByCategory: Record<string, PermissionDTO[]>;
}

export interface GrantPermissionRequestDTO {
  adminId: string;
  permissionCode: string;
}

export interface RevokePermissionRequestDTO {
  adminId: string;
  permissionCode: string;
}

export interface UpdateAdminRoleRequestDTO {
  adminId: string;
  newRole: AdminRole;
  reason: string;
}

export interface BulkPermissionUpdateRequestDTO {
  adminId: string;
  permissionsToGrant: string[];
  permissionsToRevoke: string[];
}

// ============================================================================
// Role Permission Management DTOs
// ============================================================================

export interface AssignRolePermissionRequestDTO {
  role: AdminRole;
  permissionCode: string;
  canDelegate: boolean;
}

export interface RemoveRolePermissionRequestDTO {
  role: AdminRole;
  permissionCode: string;
}

export interface BulkRolePermissionUpdateRequestDTO {
  role: AdminRole;
  permissionsToAdd: string[];
  permissionsToRemove: string[];
}

// ============================================================================
// Permission Check DTOs
// ============================================================================

export interface PermissionCheckRequestDTO {
  permissionCode: string;
}

export interface PermissionCheckResponseDTO {
  allowed: boolean;
  requiresMfa: boolean;
  requiresApproval: boolean;
  reason?: string;
}

export interface BulkPermissionCheckRequestDTO {
  permissionCodes: string[];
  checkMode: 'all' | 'any';
}

// ============================================================================
// Custom Role DTOs (for future custom role builder)
// ============================================================================

export interface CustomRoleCreateRequestDTO {
  name: string;
  displayName: string;
  description: string;
  baseRole?: AdminRole;
  permissions: string[];
}

export interface CustomRoleUpdateRequestDTO {
  displayName?: string;
  description?: string;
  permissions?: string[];
  isActive?: boolean;
}

export interface CustomRoleDTO {
  id: string;
  name: string;
  displayName: string;
  description: string;
  baseRole: AdminRole | null;
  permissions: PermissionDTO[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// ============================================================================
// Audit DTOs
// ============================================================================

export interface PermissionChangeAuditDTO {
  id: string;
  adminId: string;
  adminUsername: string;
  changeType: 'GRANT' | 'REVOKE' | 'ROLE_CHANGE';
  permissionCode?: string;
  previousRole?: AdminRole;
  newRole?: AdminRole;
  changedBy: string;
  changedByUsername: string;
  reason?: string;
  timestamp: Date;
}

// ============================================================================
// Permission Matrix DTO (for UI)
// ============================================================================

export interface PermissionMatrixDTO {
  permissions: PermissionDTO[];
  roles: {
    role: AdminRole;
    displayName: string;
    permissions: Record<string, boolean>;
  }[];
}

// ============================================================================
// Response Wrappers
// ============================================================================

export interface RBACSuccessResponseDTO {
  success: boolean;
  message: string;
}

export interface RBACErrorResponseDTO {
  success: false;
  error: string;
  code?: string;
}
