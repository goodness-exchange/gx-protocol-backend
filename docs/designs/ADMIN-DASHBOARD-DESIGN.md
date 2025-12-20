# GX Protocol Admin Dashboard - Complete Design Document

**Version:** 1.0.0
**Date:** 2025-12-20
**Status:** Design Phase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Project Structure](#4-project-structure)
5. [Authentication & Security](#5-authentication--security)
6. [State Management](#6-state-management)
7. [API Integration Layer](#7-api-integration-layer)
8. [Pages & Features](#8-pages--features)
9. [Component Library](#9-component-library)
10. [Real-time Features](#10-real-time-features)
11. [Error Handling & UX](#11-error-handling--ux)
12. [Testing Strategy](#12-testing-strategy)
13. [Deployment & DevOps](#13-deployment--devops)
14. [Implementation Phases](#14-implementation-phases)

---

## 1. Executive Summary

### Purpose
A secure, modern admin dashboard for the GX Protocol platform that provides:
- Role-based access control (RBAC) with hierarchical permissions
- Multi-signature approval workflows for critical operations
- Real-time notifications and alerts
- Comprehensive audit logging
- User and system management capabilities

### Design Principles
1. **Security First** - Every feature designed with security as priority
2. **Zero Trust** - Never trust, always verify
3. **Separation of Concerns** - Clean architecture layers
4. **Progressive Disclosure** - Show complexity only when needed
5. **Accessibility** - WCAG 2.1 AA compliance
6. **Performance** - Sub-second page loads, optimistic updates

### Target Users
| Role | Primary Use Cases |
|------|-------------------|
| SUPER_OWNER | Full system control, critical approvals, admin management |
| ADMIN | User management, routine approvals, monitoring |
| AUDITOR | Read-only access to logs and reports |
| DEVELOPER | DevNet/TestNet operations, deployment promotions |

---

## 2. Technology Stack

### Core Framework
```
Next.js 15 (App Router)
├── React 19 with Server Components
├── TypeScript 5.x (strict mode)
└── Turbopack for development
```

### UI Layer
```
Tailwind CSS 4.x
├── Shadcn/UI (component primitives)
├── Radix UI (accessible primitives)
├── Lucide React (icons)
├── Framer Motion (animations)
└── Recharts (data visualization)
```

### State & Data
```
TanStack Query v5 (server state)
├── Zustand (client state)
├── React Hook Form + Zod (forms)
└── nuqs (URL state management)
```

### Security
```
Authentication
├── JWT with refresh token rotation
├── TOTP-based MFA (otpauth)
├── Secure cookie storage (httpOnly)
└── CSRF protection

Session Management
├── Idle timeout detection
├── Concurrent session limits
└── Device fingerprinting
```

### Development Tools
```
Testing: Vitest + React Testing Library + Playwright
Linting: ESLint + Prettier + TypeScript strict
CI/CD: GitHub Actions
Monitoring: Sentry (errors) + Vercel Analytics
```

---

## 3. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ADMIN DASHBOARD                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      PRESENTATION LAYER                           │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │   │
│  │  │  Pages  │  │  Layouts│  │Components│  │  Hooks  │  │   UI    │ │   │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘ │   │
│  └───────┼───────────┼───────────┼───────────┼───────────┼─────────┘   │
│          │           │           │           │           │              │
│  ┌───────┴───────────┴───────────┴───────────┴───────────┴─────────┐   │
│  │                       STATE LAYER                                 │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │   │
│  │  │  TanStack Query │  │     Zustand     │  │   URL State     │   │   │
│  │  │  (Server State) │  │  (Client State) │  │   (nuqs)        │   │   │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │   │
│  └───────────┼────────────────────┼────────────────────┼────────────┘   │
│              │                    │                    │                 │
│  ┌───────────┴────────────────────┴────────────────────┴────────────┐   │
│  │                      SERVICE LAYER                                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │   │
│  │  │  API Client │  │  Auth Svc   │  │  WebSocket  │               │   │
│  │  │  (Axios)    │  │  (JWT/MFA)  │  │  (Real-time)│               │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘               │   │
│  └─────────┼────────────────┼────────────────┼──────────────────────┘   │
│            │                │                │                           │
│            ▼                ▼                ▼                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    BACKEND API (svc-admin)                        │   │
│  │                  https://api.gxcoin.money                         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Request Flow

```
User Action
    │
    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React     │────▶│  TanStack   │────▶│   Axios     │
│  Component  │     │   Query     │     │  Interceptor│
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                    ┌───────────────────────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  Auth Check     │
           │  (Token Valid?) │
           └────────┬────────┘
                    │
        ┌───────────┴───────────┐
        │ No                    │ Yes
        ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│ Refresh Token   │    │  API Request    │
│ or Redirect     │    │  with Bearer    │
└─────────────────┘    └────────┬────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Backend API   │
                       │   Response      │
                       └────────┬────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  Update Cache   │
                       │  & UI           │
                       └─────────────────┘
```

---

## 4. Project Structure

```
gx-admin-dashboard/
├── public/
│   ├── favicon.ico
│   ├── logo.svg
│   └── manifest.json
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth routes (no layout)
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── mfa-verify/
│   │   │   │   └── page.tsx
│   │   │   ├── forgot-password/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/              # Protected dashboard routes
│   │   │   ├── layout.tsx            # Dashboard shell with sidebar
│   │   │   ├── page.tsx              # Dashboard home (redirects based on role)
│   │   │   │
│   │   │   ├── overview/             # Main dashboard overview
│   │   │   │   └── page.tsx
│   │   │   │
│   │   │   ├── approvals/            # Approval workflow
│   │   │   │   ├── page.tsx          # List approvals
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx      # Approval detail
│   │   │   │   └── create/
│   │   │   │       └── page.tsx      # Create approval request
│   │   │   │
│   │   │   ├── users/                # User management
│   │   │   │   ├── page.tsx          # User list
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx      # User detail
│   │   │   │   ├── pending/
│   │   │   │   │   └── page.tsx      # Pending registrations
│   │   │   │   └── frozen/
│   │   │   │       └── page.tsx      # Frozen accounts
│   │   │   │
│   │   │   ├── admins/               # Admin management (SUPER_OWNER only)
│   │   │   │   ├── page.tsx          # Admin list
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx      # Admin detail
│   │   │   │   └── create/
│   │   │   │       └── page.tsx      # Create admin
│   │   │   │
│   │   │   ├── notifications/        # Notification center
│   │   │   │   ├── page.tsx          # All notifications
│   │   │   │   └── webhooks/
│   │   │   │       ├── page.tsx      # Webhook list
│   │   │   │       └── [id]/
│   │   │   │           └── page.tsx  # Webhook detail
│   │   │   │
│   │   │   ├── audit-logs/           # Audit log viewer
│   │   │   │   └── page.tsx
│   │   │   │
│   │   │   ├── treasury/             # Treasury management
│   │   │   │   ├── page.tsx          # Treasury overview
│   │   │   │   └── transfers/
│   │   │   │       └── page.tsx      # Transfer history
│   │   │   │
│   │   │   ├── system/               # System management
│   │   │   │   ├── page.tsx          # System status
│   │   │   │   ├── config/
│   │   │   │   │   └── page.tsx      # Configuration
│   │   │   │   ├── countries/
│   │   │   │   │   └── page.tsx      # Country management
│   │   │   │   └── deployments/
│   │   │   │       └── page.tsx      # Deployment promotions
│   │   │   │
│   │   │   └── settings/             # User settings
│   │   │       ├── page.tsx          # Profile
│   │   │       ├── security/
│   │   │       │   └── page.tsx      # MFA, password, sessions
│   │   │       └── preferences/
│   │   │           └── page.tsx      # Theme, notifications
│   │   │
│   │   ├── api/                      # API routes (if needed for BFF)
│   │   │   └── auth/
│   │   │       └── [...nextauth]/
│   │   │           └── route.ts
│   │   │
│   │   ├── error.tsx                 # Global error boundary
│   │   ├── not-found.tsx             # 404 page
│   │   ├── loading.tsx               # Global loading
│   │   └── layout.tsx                # Root layout
│   │
│   ├── components/
│   │   ├── ui/                       # Base UI components (Shadcn)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── table.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ... (40+ components)
│   │   │
│   │   ├── layout/                   # Layout components
│   │   │   ├── sidebar/
│   │   │   │   ├── sidebar.tsx
│   │   │   │   ├── sidebar-nav.tsx
│   │   │   │   ├── sidebar-user.tsx
│   │   │   │   └── sidebar-logo.tsx
│   │   │   ├── header/
│   │   │   │   ├── header.tsx
│   │   │   │   ├── header-search.tsx
│   │   │   │   ├── header-notifications.tsx
│   │   │   │   └── header-user-menu.tsx
│   │   │   └── breadcrumb.tsx
│   │   │
│   │   ├── features/                 # Feature-specific components
│   │   │   ├── auth/
│   │   │   │   ├── login-form.tsx
│   │   │   │   ├── mfa-form.tsx
│   │   │   │   ├── password-strength.tsx
│   │   │   │   └── session-manager.tsx
│   │   │   │
│   │   │   ├── approvals/
│   │   │   │   ├── approval-card.tsx
│   │   │   │   ├── approval-list.tsx
│   │   │   │   ├── approval-detail.tsx
│   │   │   │   ├── approval-vote-dialog.tsx
│   │   │   │   ├── approval-timeline.tsx
│   │   │   │   └── create-approval-form.tsx
│   │   │   │
│   │   │   ├── users/
│   │   │   │   ├── user-table.tsx
│   │   │   │   ├── user-card.tsx
│   │   │   │   ├── user-detail.tsx
│   │   │   │   ├── user-actions.tsx
│   │   │   │   └── user-filters.tsx
│   │   │   │
│   │   │   ├── notifications/
│   │   │   │   ├── notification-list.tsx
│   │   │   │   ├── notification-item.tsx
│   │   │   │   ├── notification-bell.tsx
│   │   │   │   └── webhook-form.tsx
│   │   │   │
│   │   │   ├── audit/
│   │   │   │   ├── audit-table.tsx
│   │   │   │   ├── audit-detail.tsx
│   │   │   │   ├── audit-filters.tsx
│   │   │   │   └── audit-export.tsx
│   │   │   │
│   │   │   ├── treasury/
│   │   │   │   ├── treasury-balance.tsx
│   │   │   │   ├── transfer-form.tsx
│   │   │   │   └── transfer-history.tsx
│   │   │   │
│   │   │   └── dashboard/
│   │   │       ├── stats-cards.tsx
│   │   │       ├── pending-approvals.tsx
│   │   │       ├── recent-activity.tsx
│   │   │       ├── system-health.tsx
│   │   │       └── quick-actions.tsx
│   │   │
│   │   └── shared/                   # Shared components
│   │       ├── data-table/
│   │       │   ├── data-table.tsx
│   │       │   ├── data-table-pagination.tsx
│   │       │   ├── data-table-toolbar.tsx
│   │       │   └── data-table-column-header.tsx
│   │       ├── empty-state.tsx
│   │       ├── loading-skeleton.tsx
│   │       ├── error-boundary.tsx
│   │       ├── confirm-dialog.tsx
│   │       ├── status-badge.tsx
│   │       └── date-range-picker.tsx
│   │
│   ├── hooks/                        # Custom React hooks
│   │   ├── use-auth.ts               # Authentication hook
│   │   ├── use-permissions.ts        # Permission checking
│   │   ├── use-approvals.ts          # Approval queries
│   │   ├── use-users.ts              # User queries
│   │   ├── use-notifications.ts      # Notification queries
│   │   ├── use-debounce.ts           # Debounce utility
│   │   ├── use-media-query.ts        # Responsive utilities
│   │   └── use-idle-timeout.ts       # Session idle detection
│   │
│   ├── lib/                          # Utilities and configuration
│   │   ├── api/
│   │   │   ├── client.ts             # Axios instance
│   │   │   ├── interceptors.ts       # Request/response interceptors
│   │   │   ├── endpoints.ts          # API endpoint constants
│   │   │   └── types.ts              # API response types
│   │   │
│   │   ├── auth/
│   │   │   ├── tokens.ts             # Token management
│   │   │   ├── session.ts            # Session utilities
│   │   │   └── mfa.ts                # MFA utilities
│   │   │
│   │   ├── utils/
│   │   │   ├── cn.ts                 # Class name utility
│   │   │   ├── format.ts             # Formatters (date, currency)
│   │   │   ├── validators.ts         # Validation utilities
│   │   │   └── constants.ts          # App constants
│   │   │
│   │   └── config.ts                 # Environment config
│   │
│   ├── stores/                       # Zustand stores
│   │   ├── auth-store.ts             # Auth state
│   │   ├── ui-store.ts               # UI preferences
│   │   └── notification-store.ts     # Real-time notifications
│   │
│   ├── types/                        # TypeScript types
│   │   ├── auth.ts
│   │   ├── user.ts
│   │   ├── approval.ts
│   │   ├── notification.ts
│   │   ├── audit.ts
│   │   └── api.ts
│   │
│   └── styles/
│       └── globals.css               # Global styles + Tailwind
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.example
├── .env.local
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 5. Authentication & Security

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATION FLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────┐                                                             │
│  │  User   │                                                             │
│  │  Opens  │                                                             │
│  │  App    │                                                             │
│  └────┬────┘                                                             │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────┐     No      ┌─────────────┐                            │
│  │ Has Valid   │────────────▶│   Login     │                            │
│  │ Token?      │             │   Page      │                            │
│  └──────┬──────┘             └──────┬──────┘                            │
│         │ Yes                       │                                    │
│         │                           ▼                                    │
│         │               ┌─────────────────────┐                         │
│         │               │  Enter Credentials  │                         │
│         │               │  username/password  │                         │
│         │               └──────────┬──────────┘                         │
│         │                          │                                     │
│         │                          ▼                                     │
│         │               ┌─────────────────────┐                         │
│         │               │  POST /auth/login   │                         │
│         │               └──────────┬──────────┘                         │
│         │                          │                                     │
│         │            ┌─────────────┴─────────────┐                      │
│         │            │                           │                       │
│         │            ▼                           ▼                       │
│         │   ┌─────────────────┐       ┌─────────────────┐               │
│         │   │  MFA Required?  │       │  Login Failed   │               │
│         │   │  requiresMfa    │       │  Show Error     │               │
│         │   └────────┬────────┘       └─────────────────┘               │
│         │            │ Yes                                               │
│         │            ▼                                                   │
│         │   ┌─────────────────┐                                         │
│         │   │  MFA Verify     │                                         │
│         │   │  Page           │                                         │
│         │   └────────┬────────┘                                         │
│         │            │                                                   │
│         │            ▼                                                   │
│         │   ┌─────────────────┐                                         │
│         │   │  Enter TOTP     │                                         │
│         │   │  6-digit code   │                                         │
│         │   └────────┬────────┘                                         │
│         │            │                                                   │
│         │            ▼                                                   │
│         │   ┌─────────────────────┐                                     │
│         │   │  POST /auth/mfa/    │                                     │
│         │   │  verify             │                                     │
│         │   └──────────┬──────────┘                                     │
│         │              │                                                 │
│         │              ▼                                                 │
│         │   ┌─────────────────────┐                                     │
│         │   │  Store Tokens       │                                     │
│         │   │  accessToken        │                                     │
│         │   │  refreshToken       │                                     │
│         │   └──────────┬──────────┘                                     │
│         │              │                                                 │
│         ▼              ▼                                                 │
│  ┌─────────────────────────────────┐                                    │
│  │         DASHBOARD               │                                    │
│  │  (Role-based landing page)      │                                    │
│  └─────────────────────────────────┘                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Token Management

```typescript
// src/lib/auth/tokens.ts

interface TokenStore {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

class TokenManager {
  private static ACCESS_TOKEN_KEY = 'gx_access_token';
  private static REFRESH_TOKEN_KEY = 'gx_refresh_token';
  private static EXPIRES_KEY = 'gx_token_expires';

  // Store tokens securely
  static setTokens(accessToken: string, refreshToken: string, expiresIn: number) {
    const expiresAt = Date.now() + (expiresIn * 1000);

    // Use httpOnly cookies in production via API route
    // For now, use sessionStorage (not localStorage for security)
    sessionStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
    sessionStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    sessionStorage.setItem(this.EXPIRES_KEY, expiresAt.toString());
  }

  // Get access token
  static getAccessToken(): string | null {
    return sessionStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  // Check if token is expired (with 30s buffer)
  static isTokenExpired(): boolean {
    const expiresAt = sessionStorage.getItem(this.EXPIRES_KEY);
    if (!expiresAt) return true;
    return Date.now() >= (parseInt(expiresAt) - 30000);
  }

  // Clear all tokens
  static clearTokens() {
    sessionStorage.removeItem(this.ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(this.REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(this.EXPIRES_KEY);
  }
}
```

### Permission-Based Route Protection

```typescript
// src/lib/auth/permissions.ts

export const PERMISSIONS = {
  // System
  SYSTEM_STATUS_READ: 'system:status:read',
  SYSTEM_PAUSE: 'system:pause',
  SYSTEM_RESUME: 'system:resume',
  SYSTEM_BOOTSTRAP: 'system:bootstrap',

  // Users
  USER_LIST: 'user:list',
  USER_VIEW: 'user:view',
  USER_APPROVE: 'user:approve',
  USER_DENY: 'user:deny',
  USER_FREEZE: 'user:freeze',
  USER_UNFREEZE: 'user:unfreeze',

  // Treasury
  TREASURY_VIEW: 'treasury:view',
  TREASURY_ACTIVATE: 'treasury:activate',
  TREASURY_TRANSFER: 'treasury:transfer',

  // Approvals
  APPROVAL_VIEW: 'approval:view',
  APPROVAL_CREATE: 'approval:create',
  APPROVAL_APPROVE: 'approval:approve',
  APPROVAL_REJECT: 'approval:reject',

  // Admin management
  ADMIN_LIST: 'admin:list',
  ADMIN_CREATE: 'admin:create',
  ADMIN_UPDATE: 'admin:update',
  ADMIN_DELETE: 'admin:delete',
  ADMIN_ROLE_CHANGE: 'admin:role:change',

  // Audit
  AUDIT_VIEW: 'audit:view',
  AUDIT_EXPORT: 'audit:export',

  // Config
  CONFIG_VIEW: 'config:view',
  CONFIG_UPDATE: 'config:update',

  // Deployments
  DEPLOYMENT_VIEW: 'deployment:view',
  DEPLOYMENT_PROMOTE_DEVNET_TESTNET: 'deployment:promote:devnet-testnet',
  DEPLOYMENT_PROMOTE_TESTNET_MAINNET: 'deployment:promote:testnet-mainnet',
} as const;

// Route permission mapping
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/overview': [PERMISSIONS.SYSTEM_STATUS_READ],
  '/approvals': [PERMISSIONS.APPROVAL_VIEW],
  '/approvals/create': [PERMISSIONS.APPROVAL_CREATE],
  '/users': [PERMISSIONS.USER_LIST],
  '/users/pending': [PERMISSIONS.USER_APPROVE],
  '/users/frozen': [PERMISSIONS.USER_FREEZE],
  '/admins': [PERMISSIONS.ADMIN_LIST],
  '/admins/create': [PERMISSIONS.ADMIN_CREATE],
  '/treasury': [PERMISSIONS.TREASURY_VIEW],
  '/treasury/transfers': [PERMISSIONS.TREASURY_TRANSFER],
  '/audit-logs': [PERMISSIONS.AUDIT_VIEW],
  '/system/config': [PERMISSIONS.CONFIG_VIEW],
  '/system/deployments': [PERMISSIONS.DEPLOYMENT_VIEW],
};
```

### Idle Timeout Detection

```typescript
// src/hooks/use-idle-timeout.ts

import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';

interface IdleTimeoutOptions {
  timeout: number; // milliseconds
  onIdle: () => void;
  onActive?: () => void;
}

export function useIdleTimeout({ timeout, onIdle, onActive }: IdleTimeoutOptions) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const isIdleRef = useRef(false);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (isIdleRef.current) {
      isIdleRef.current = false;
      onActive?.();
    }

    timeoutRef.current = setTimeout(() => {
      isIdleRef.current = true;
      onIdle();
    }, timeout);
  }, [timeout, onIdle, onActive]);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    events.forEach(event => {
      document.addEventListener(event, resetTimer, true);
    });

    resetTimer(); // Start the timer

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, resetTimer, true);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [resetTimer]);
}

// Usage in dashboard layout
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { logout, admin } = useAuthStore();

  // Different timeouts based on role
  const timeout = admin?.role === 'SUPER_OWNER'
    ? 60 * 60 * 1000  // 60 minutes
    : 30 * 60 * 1000; // 30 minutes

  useIdleTimeout({
    timeout,
    onIdle: () => {
      logout();
      // Show session expired modal
    },
  });

  return <>{children}</>;
}
```

---

## 6. State Management

### Auth Store (Zustand)

```typescript
// src/stores/auth-store.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api } from '@/lib/api/client';
import { TokenManager } from '@/lib/auth/tokens';

interface Admin {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: 'SUPER_OWNER' | 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'DEVELOPER' | 'AUDITOR';
  permissions: string[];
  mfaEnabled: boolean;
}

interface AuthState {
  // State
  admin: Admin | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requiresMfa: boolean;
  mfaSessionToken: string | null;

  // Actions
  login: (username: string, password: string) => Promise<{ requiresMfa: boolean }>;
  verifyMfa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      admin: null,
      isAuthenticated: false,
      isLoading: false,
      requiresMfa: false,
      mfaSessionToken: null,

      // Login
      login: async (username, password) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/admin/auth/login', { username, password });
          const { requiresMfa, accessToken, refreshToken, expiresIn, admin, mfaSessionToken } = response.data;

          if (requiresMfa) {
            set({ requiresMfa: true, mfaSessionToken, isLoading: false });
            return { requiresMfa: true };
          }

          TokenManager.setTokens(accessToken, refreshToken, expiresIn);
          set({
            admin,
            isAuthenticated: true,
            isLoading: false,
            requiresMfa: false,
          });

          return { requiresMfa: false };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Verify MFA
      verifyMfa: async (code) => {
        const { mfaSessionToken } = get();
        set({ isLoading: true });

        try {
          const response = await api.post('/admin/auth/mfa/verify', {
            code,
            sessionToken: mfaSessionToken
          });
          const { accessToken, refreshToken, expiresIn, admin } = response.data;

          TokenManager.setTokens(accessToken, refreshToken, expiresIn);
          set({
            admin,
            isAuthenticated: true,
            isLoading: false,
            requiresMfa: false,
            mfaSessionToken: null,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Logout
      logout: async () => {
        try {
          await api.post('/admin/auth/logout');
        } catch (error) {
          // Ignore errors, clear local state anyway
        }
        TokenManager.clearTokens();
        set({
          admin: null,
          isAuthenticated: false,
          requiresMfa: false,
          mfaSessionToken: null,
        });
      },

      // Refresh token
      refreshToken: async () => {
        const refreshToken = TokenManager.getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');

        const response = await api.post('/admin/auth/refresh', { refreshToken });
        const { accessToken, refreshToken: newRefreshToken, expiresIn } = response.data;

        TokenManager.setTokens(accessToken, newRefreshToken, expiresIn);
      },

      // Fetch profile
      fetchProfile: async () => {
        const response = await api.get('/admin/auth/profile');
        set({ admin: response.data.admin });
      },

      // Permission helpers
      hasPermission: (permission) => {
        const { admin } = get();
        if (!admin) return false;
        if (admin.role === 'SUPER_OWNER') return true;
        return admin.permissions.includes(permission);
      },

      hasAnyPermission: (permissions) => {
        return permissions.some(p => get().hasPermission(p));
      },

      hasAllPermissions: (permissions) => {
        return permissions.every(p => get().hasPermission(p));
      },
    }),
    {
      name: 'gx-admin-auth',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        admin: state.admin,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
```

### UI Store

```typescript
// src/stores/ui-store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  toggleSidebar: () => void;
  setSidebarMobileOpen: (open: boolean) => void;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Notifications panel
  notificationsPanelOpen: boolean;
  setNotificationsPanelOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      theme: 'system',
      notificationsPanelOpen: false,

      toggleSidebar: () => set((state) => ({
        sidebarCollapsed: !state.sidebarCollapsed
      })),

      setSidebarMobileOpen: (open) => set({ sidebarMobileOpen: open }),

      setTheme: (theme) => set({ theme }),

      setNotificationsPanelOpen: (open) => set({ notificationsPanelOpen: open }),
    }),
    {
      name: 'gx-admin-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    }
  )
);
```

---

## 7. API Integration Layer

### Axios Client Configuration

```typescript
// src/lib/api/client.ts

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { TokenManager } from '@/lib/auth/tokens';
import { useAuthStore } from '@/stores/auth-store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.gxcoin.money';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = TokenManager.getAccessToken();

    if (token) {
      // Check if token is expired
      if (TokenManager.isTokenExpired()) {
        try {
          await useAuthStore.getState().refreshToken();
          const newToken = TokenManager.getAccessToken();
          config.headers.Authorization = `Bearer ${newToken}`;
        } catch {
          // Refresh failed, redirect to login
          useAuthStore.getState().logout();
          window.location.href = '/login';
          return Promise.reject(new Error('Session expired'));
        }
      } else {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      // Try to refresh token once
      if (!originalRequest?.headers?.['X-Retry']) {
        try {
          await useAuthStore.getState().refreshToken();
          originalRequest!.headers['X-Retry'] = 'true';
          return api(originalRequest!);
        } catch {
          useAuthStore.getState().logout();
          window.location.href = '/login';
        }
      }
    }

    // Format error for UI
    const message = (error.response?.data as any)?.message
      || error.message
      || 'An unexpected error occurred';

    return Promise.reject(new Error(message));
  }
);
```

### API Endpoints

```typescript
// src/lib/api/endpoints.ts

export const ENDPOINTS = {
  // Auth
  AUTH: {
    LOGIN: '/admin/auth/login',
    MFA_VERIFY: '/admin/auth/mfa/verify',
    MFA_SETUP: '/admin/auth/mfa/setup',
    MFA_ENABLE: '/admin/auth/mfa/enable',
    MFA_DISABLE: '/admin/auth/mfa/disable',
    REFRESH: '/admin/auth/refresh',
    LOGOUT: '/admin/auth/logout',
    PROFILE: '/admin/auth/profile',
    SESSIONS: '/admin/auth/sessions',
    CHANGE_PASSWORD: '/admin/auth/change-password',
  },

  // Approvals
  APPROVALS: {
    LIST: '/admin/approvals',
    CREATE: '/admin/approvals',
    GET: (id: string) => `/admin/approvals/${id}`,
    VOTE: (id: string) => `/admin/approvals/${id}/vote`,
    CANCEL: (id: string) => `/admin/approvals/${id}/cancel`,
    EXECUTE: (id: string) => `/admin/approvals/${id}/execute`,
    PENDING_COUNT: '/admin/approvals/pending-count',
  },

  // Notifications
  NOTIFICATIONS: {
    LIST: '/admin/notifications',
    UNREAD_COUNT: '/admin/notifications/unread-count',
    MARK_READ: (id: string) => `/admin/notifications/${id}/read`,
    MARK_ALL_READ: '/admin/notifications/mark-all-read',
    WEBHOOKS: {
      LIST: '/admin/notifications/webhooks',
      CREATE: '/admin/notifications/webhooks',
      GET: (id: string) => `/admin/notifications/webhooks/${id}`,
      UPDATE: (id: string) => `/admin/notifications/webhooks/${id}`,
      DELETE: (id: string) => `/admin/notifications/webhooks/${id}`,
      REGENERATE_SECRET: (id: string) => `/admin/notifications/webhooks/${id}/regenerate-secret`,
    },
  },

  // Users
  USERS: {
    LIST: '/admin/users',
    GET: (id: string) => `/admin/users/${id}`,
    PENDING: '/admin/users?status=PENDING',
    APPROVE: (id: string) => `/admin/users/${id}/approve`,
    DENY: (id: string) => `/admin/users/${id}/deny`,
    FREEZE: (id: string) => `/admin/users/${id}/freeze`,
    UNFREEZE: (id: string) => `/admin/users/${id}/unfreeze`,
    PENDING_ONCHAIN: '/admin/users/pending-onchain',
    BATCH_REGISTER: '/admin/users/batch-register-onchain',
  },

  // Admins
  ADMINS: {
    LIST: '/admin/admins',
    CREATE: '/admin/admins',
    GET: (id: string) => `/admin/admins/${id}`,
    UPDATE: (id: string) => `/admin/admins/${id}`,
    DELETE: (id: string) => `/admin/admins/${id}`,
    CHANGE_ROLE: (id: string) => `/admin/admins/${id}/role`,
  },

  // System
  SYSTEM: {
    STATUS: '/admin/system/status',
    PAUSE: '/admin/system/pause',
    RESUME: '/admin/system/resume',
    BOOTSTRAP: '/admin/bootstrap',
    PARAMETERS: '/admin/parameters',
    COUNTRIES: '/admin/countries',
    COUNTERS: '/admin/counters',
  },

  // Treasury
  TREASURY: {
    STATUS: '/admin/treasury',
    ACTIVATE: '/admin/treasury/activate',
    TRANSFER: '/admin/treasury/transfer',
  },

  // Audit
  AUDIT: {
    LIST: '/admin/audit-logs',
    GET: (id: string) => `/admin/audit-logs/${id}`,
    EXPORT: '/admin/audit-logs/export',
  },
} as const;
```

### TanStack Query Hooks

```typescript
// src/hooks/use-approvals.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { Approval, ApprovalListParams, CreateApprovalInput, VoteInput } from '@/types/approval';

// Query keys
export const approvalKeys = {
  all: ['approvals'] as const,
  lists: () => [...approvalKeys.all, 'list'] as const,
  list: (params: ApprovalListParams) => [...approvalKeys.lists(), params] as const,
  details: () => [...approvalKeys.all, 'detail'] as const,
  detail: (id: string) => [...approvalKeys.details(), id] as const,
  pendingCount: () => [...approvalKeys.all, 'pending-count'] as const,
};

// List approvals
export function useApprovals(params: ApprovalListParams = {}) {
  return useQuery({
    queryKey: approvalKeys.list(params),
    queryFn: async () => {
      const { data } = await api.get(ENDPOINTS.APPROVALS.LIST, { params });
      return data;
    },
  });
}

// Get single approval
export function useApproval(id: string) {
  return useQuery({
    queryKey: approvalKeys.detail(id),
    queryFn: async () => {
      const { data } = await api.get(ENDPOINTS.APPROVALS.GET(id));
      return data;
    },
    enabled: !!id,
  });
}

// Get pending count
export function usePendingApprovalsCount() {
  return useQuery({
    queryKey: approvalKeys.pendingCount(),
    queryFn: async () => {
      const { data } = await api.get(ENDPOINTS.APPROVALS.PENDING_COUNT);
      return data.pendingCount;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Create approval
export function useCreateApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateApprovalInput) => {
      const { data } = await api.post(ENDPOINTS.APPROVALS.CREATE, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.all });
    },
  });
}

// Vote on approval
export function useVoteOnApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: VoteInput & { id: string }) => {
      const { data } = await api.post(ENDPOINTS.APPROVALS.VOTE(id), input);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      queryClient.invalidateQueries({ queryKey: approvalKeys.pendingCount() });
    },
  });
}

// Cancel approval
export function useCancelApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(ENDPOINTS.APPROVALS.CANCEL(id));
      return data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: approvalKeys.lists() });
      queryClient.invalidateQueries({ queryKey: approvalKeys.pendingCount() });
    },
  });
}
```

---

## 8. Pages & Features

### Page Specifications

#### 8.1 Login Page

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   ┌───────────────────────┐   ┌────────────────────────────────────┐    │
│   │                       │   │                                    │    │
│   │                       │   │        Admin Portal                │    │
│   │     GX COIN           │   │                                    │    │
│   │     LOGO              │   │   ┌────────────────────────────┐   │    │
│   │                       │   │   │  Username                  │   │    │
│   │     "Secure Admin     │   │   │  _________________________ │   │    │
│   │      Portal"          │   │   └────────────────────────────┘   │    │
│   │                       │   │                                    │    │
│   │                       │   │   ┌────────────────────────────┐   │    │
│   │                       │   │   │  Password                  │   │    │
│   │                       │   │   │  _________________________ │   │    │
│   │                       │   │   └────────────────────────────┘   │    │
│   │                       │   │                                    │    │
│   │                       │   │   ┌────────────────────────────┐   │    │
│   │                       │   │   │        Sign In             │   │    │
│   │                       │   │   └────────────────────────────┘   │    │
│   │                       │   │                                    │    │
│   │                       │   │   Forgot password?                 │    │
│   │                       │   │                                    │    │
│   └───────────────────────┘   └────────────────────────────────────┘    │
│                                                                          │
│   Environment: MainNet | Version: 2.1.10                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Clean split-screen design
- Username/password authentication
- Remember device option
- Forgot password link
- Environment indicator (MainNet/TestNet/DevNet)
- Rate limiting display (after failed attempts)

#### 8.2 MFA Verification Page

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                    Two-Factor Authentication                             │
│                                                                          │
│              Enter the 6-digit code from your                           │
│              authenticator app                                           │
│                                                                          │
│              ┌───┐ ┌───┐ ┌───┐  ┌───┐ ┌───┐ ┌───┐                       │
│              │   │ │   │ │   │  │   │ │   │ │   │                       │
│              └───┘ └───┘ └───┘  └───┘ └───┘ └───┘                       │
│                                                                          │
│              ┌─────────────────────────────────┐                        │
│              │           Verify                 │                        │
│              └─────────────────────────────────┘                        │
│                                                                          │
│              Use backup code instead                                     │
│                                                                          │
│              ← Back to login                                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 8.3 Dashboard Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☰ GX Admin                            🔔 3    👤 superowner ▼           │
├─────────┬───────────────────────────────────────────────────────────────┤
│         │                                                                │
│ Overview│   Welcome back, Owner                                          │
│ ────────│   Last login: 2 hours ago from 192.168.1.1                    │
│         │                                                                │
│ APPROVAL│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐             │
│ ───────│   │ Pending │ │ Active  │ │ Frozen  │ │ On-chain│             │
│ Pending │   │ Approvals│ │  Users  │ │ Accounts│ │ Pending │             │
│ History │   │    3    │ │  1,234  │ │    5    │ │   12    │             │
│         │   └─────────┘ └─────────┘ └─────────┘ └─────────┘             │
│ USERS   │                                                                │
│ ────────│   ┌────────────────────────────────────────────────────────┐  │
│ All Users│   │  Pending Approvals                           View All │  │
│ Pending │   ├────────────────────────────────────────────────────────┤  │
│ Frozen  │   │  🔴 TREASURY_OPERATION - Transfer 10,000 GXC           │  │
│         │   │     Requested by: manazir • 2 hours ago                │  │
│ TREASURY│   │     [Approve] [Reject] [View]                          │  │
│ ────────│   ├────────────────────────────────────────────────────────┤  │
│ Balance │   │  🟡 DEPLOYMENT_PROMOTION - Promote to MainNet          │  │
│ Transfers│   │     Requested by: developer1 • 5 hours ago            │  │
│         │   │     [Approve] [Reject] [View]                          │  │
│ SYSTEM  │   └────────────────────────────────────────────────────────┘  │
│ ────────│                                                                │
│ Status  │   ┌──────────────────────┐ ┌──────────────────────┐           │
│ Config  │   │  Recent Activity     │ │  System Health       │           │
│ Audit   │   ├──────────────────────┤ ├──────────────────────┤           │
│         │   │  • User approved     │ │  ● API: Healthy      │           │
│ SETTINGS│   │  • Config updated    │ │  ● DB: Healthy       │           │
│ ────────│   │  • Admin logged in   │ │  ● Fabric: Healthy   │           │
│ Profile │   │  • Approval rejected │ │  ● Redis: Healthy    │           │
│ Security│   └──────────────────────┘ └──────────────────────┘           │
│         │                                                                │
└─────────┴───────────────────────────────────────────────────────────────┘
```

#### 8.4 Approvals List

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☰ GX Admin                            🔔 3    👤 superowner ▼           │
├─────────┬───────────────────────────────────────────────────────────────┤
│         │                                                                │
│ ...     │   Approval Requests                    [+ Create Request]     │
│         │                                                                │
│         │   ┌─────────────────────────────────────────────────────────┐ │
│         │   │ Status: [All ▼]  Type: [All ▼]  Date: [Last 7 days ▼]  │ │
│         │   └─────────────────────────────────────────────────────────┘ │
│         │                                                                │
│         │   ┌────┬──────────────┬──────────┬──────────┬────────┬─────┐ │
│         │   │ ID │ Type         │ Requester│ Status   │ Created│     │ │
│         │   ├────┼──────────────┼──────────┼──────────┼────────┼─────┤ │
│         │   │ 01 │ TREASURY_OP  │ manazir  │ 🟡PENDING│ 2h ago │ ••• │ │
│         │   │ 02 │ DEPLOY_PROMO │ dev1     │ 🟡PENDING│ 5h ago │ ••• │ │
│         │   │ 03 │ CONFIG_CHANGE│ superown │ 🟢APPROVED│ 1d ago │ ••• │ │
│         │   │ 04 │ USER_FREEZE  │ admin1   │ 🔴REJECTED│ 2d ago │ ••• │ │
│         │   │ 05 │ SYSTEM_PAUSE │ manazir  │ ⚫CANCELLED│3d ago │ ••• │ │
│         │   └────┴──────────────┴──────────┴──────────┴────────┴─────┘ │
│         │                                                                │
│         │   Showing 1-5 of 23        ◀ 1 2 3 4 5 ▶                     │
│         │                                                                │
└─────────┴───────────────────────────────────────────────────────────────┘
```

#### 8.5 Approval Detail

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☰ GX Admin                            🔔 3    👤 superowner ▼           │
├─────────┬───────────────────────────────────────────────────────────────┤
│         │                                                                │
│ ...     │   ← Back to Approvals                                         │
│         │                                                                │
│         │   ┌─────────────────────────────────────────────────────────┐ │
│         │   │  TREASURY_OPERATION                         🟡 PENDING  │ │
│         │   │  Transfer 10,000 GXC to National Treasury               │ │
│         │   ├─────────────────────────────────────────────────────────┤ │
│         │   │                                                         │ │
│         │   │  Requester:  manazir (ADMIN)                            │ │
│         │   │  Created:    Dec 20, 2025 at 09:30 AM                   │ │
│         │   │  Expires:    Dec 20, 2025 at 10:00 AM (in 25 min)       │ │
│         │   │                                                         │ │
│         │   │  ─────────────────────────────────────────────────────  │ │
│         │   │                                                         │ │
│         │   │  Reason:                                                │ │
│         │   │  "Quarterly treasury funding as per roadmap schedule"  │ │
│         │   │                                                         │ │
│         │   │  Payload:                                               │ │
│         │   │  ┌─────────────────────────────────────────────────┐   │ │
│         │   │  │ {                                               │   │ │
│         │   │  │   "amount": 10000,                              │   │ │
│         │   │  │   "currency": "GXC",                            │   │ │
│         │   │  │   "destination": "national_treasury"            │   │ │
│         │   │  │ }                                               │   │ │
│         │   │  └─────────────────────────────────────────────────┘   │ │
│         │   │                                                         │ │
│         │   │  ┌──────────────────┐  ┌──────────────────┐            │ │
│         │   │  │   ✓ Approve      │  │    ✗ Reject      │            │ │
│         │   │  └──────────────────┘  └──────────────────┘            │ │
│         │   │                                                         │ │
│         │   └─────────────────────────────────────────────────────────┘ │
│         │                                                                │
│         │   Timeline                                                     │
│         │   ┌─────────────────────────────────────────────────────────┐ │
│         │   │ ● Created by manazir                       09:30 AM    │ │
│         │   │ │                                                       │ │
│         │   │ ○ Awaiting SUPER_OWNER approval...                     │ │
│         │   └─────────────────────────────────────────────────────────┘ │
│         │                                                                │
└─────────┴───────────────────────────────────────────────────────────────┘
```

#### 8.6 User Management

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☰ GX Admin                            🔔 3    👤 superowner ▼           │
├─────────┬───────────────────────────────────────────────────────────────┤
│         │                                                                │
│ ...     │   User Management                                              │
│         │                                                                │
│         │   [All Users] [Pending (12)] [Frozen (5)] [On-chain Pending]  │
│         │                                                                │
│         │   ┌─────────────────────────────────────────────────────────┐ │
│         │   │ 🔍 Search users...                    [Filters ▼]       │ │
│         │   └─────────────────────────────────────────────────────────┘ │
│         │                                                                │
│         │   ┌────┬──────────────┬──────────────┬────────┬──────┬─────┐ │
│         │   │    │ Name         │ Email        │ Status │ KYC  │     │ │
│         │   ├────┼──────────────┼──────────────┼────────┼──────┼─────┤ │
│         │   │ ☐  │ John Doe     │ john@ex.com  │ ACTIVE │ ✓    │ ••• │ │
│         │   │ ☐  │ Jane Smith   │ jane@ex.com  │ ACTIVE │ ✓    │ ••• │ │
│         │   │ ☐  │ Bob Wilson   │ bob@ex.com   │ PENDING│ ⏳   │ ••• │ │
│         │   │ ☐  │ Alice Brown  │ alice@ex.com │ FROZEN │ ✓    │ ••• │ │
│         │   └────┴──────────────┴──────────────┴────────┴──────┴─────┘ │
│         │                                                                │
│         │   Selected: 0   [Approve] [Deny] [Freeze] [Register On-chain] │
│         │                                                                │
└─────────┴───────────────────────────────────────────────────────────────┘
```

#### 8.7 Notification Center

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☰ GX Admin                            🔔 3    👤 superowner ▼           │
├─────────┬───────────────────────────────────────────────────────────────┤
│         │                                                                │
│ ...     │   Notifications                         [Mark all as read]    │
│         │                                                                │
│         │   [All] [Unread (3)] [Approvals] [System] [Security]          │
│         │                                                                │
│         │   ┌─────────────────────────────────────────────────────────┐ │
│         │   │ 🔵 New approval request                       2 min ago │ │
│         │   │    manazir requested TREASURY_OPERATION approval        │ │
│         │   │    [View Request]                                       │ │
│         │   ├─────────────────────────────────────────────────────────┤ │
│         │   │ 🔵 New approval request                       1 hour ago│ │
│         │   │    developer1 requested DEPLOYMENT_PROMOTION approval   │ │
│         │   │    [View Request]                                       │ │
│         │   ├─────────────────────────────────────────────────────────┤ │
│         │   │ 🔵 Security alert                             3 hours ago│ │
│         │   │    Failed login attempt from IP 45.33.22.11             │ │
│         │   │    [View Details]                                       │ │
│         │   ├─────────────────────────────────────────────────────────┤ │
│         │   │ ○  System update                              Yesterday │ │
│         │   │    svc-admin deployed to version 2.1.10                 │ │
│         │   └─────────────────────────────────────────────────────────┘ │
│         │                                                                │
└─────────┴───────────────────────────────────────────────────────────────┘
```

#### 8.8 Audit Log Viewer

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☰ GX Admin                            🔔 3    👤 superowner ▼           │
├─────────┬───────────────────────────────────────────────────────────────┤
│         │                                                                │
│ ...     │   Audit Logs                                    [Export CSV]  │
│         │                                                                │
│         │   ┌─────────────────────────────────────────────────────────┐ │
│         │   │ Admin: [All ▼]  Action: [All ▼]  Date: [Last 24h ▼]    │ │
│         │   │ Category: [All ▼]  🔍 Search...                         │ │
│         │   └─────────────────────────────────────────────────────────┘ │
│         │                                                                │
│         │   ┌──────────┬──────────┬──────────────┬─────────┬─────────┐ │
│         │   │ Time     │ Admin    │ Action       │ Category│ Resource│ │
│         │   ├──────────┼──────────┼──────────────┼─────────┼─────────┤ │
│         │   │ 11:45:23 │superowner│ APPROVAL_VOTE│ SYSTEM  │ req_123 │ │
│         │   │ 11:30:15 │ manazir  │ APPROVAL_REQ │ FINANCIAL│req_122 │ │
│         │   │ 10:15:00 │superowner│ USER_FREEZE  │ USER    │ usr_456 │ │
│         │   │ 09:45:30 │ admin1   │ LOGIN        │ SYSTEM  │ session │ │
│         │   │ 09:30:00 │ manazir  │ CONFIG_VIEW  │ CONFIG  │ params  │ │
│         │   └──────────┴──────────┴──────────────┴─────────┴─────────┘ │
│         │                                                                │
│         │   Showing 1-20 of 1,456        ◀ 1 2 3 ... 73 ▶              │
│         │                                                                │
└─────────┴───────────────────────────────────────────────────────────────┘
```

---

## 9. Component Library

### Core Components

```typescript
// Component hierarchy and variants

Button
├── variant: default | destructive | outline | secondary | ghost | link
├── size: default | sm | lg | icon
└── loading: boolean

Card
├── CardHeader
├── CardTitle
├── CardDescription
├── CardContent
└── CardFooter

Dialog
├── DialogTrigger
├── DialogContent
├── DialogHeader
├── DialogTitle
├── DialogDescription
├── DialogFooter
└── DialogClose

DataTable
├── columns: ColumnDef[]
├── data: T[]
├── pagination: boolean
├── sorting: boolean
├── filtering: boolean
├── selection: boolean
└── actions: RowAction[]

Badge
├── variant: default | secondary | destructive | outline
├── status: pending | approved | rejected | cancelled (custom)
└── size: default | sm | lg

StatusBadge
├── status: PENDING | APPROVED | REJECTED | CANCELLED | ACTIVE | FROZEN
└── Automatic color and icon based on status

Empty
├── icon: LucideIcon
├── title: string
├── description: string
└── action: ReactNode

LoadingSkeleton
├── variant: card | table | list | form
└── count: number
```

### Feature Components

```typescript
// Approval components
ApprovalCard
├── approval: Approval
├── onApprove: () => void
├── onReject: () => void
├── onView: () => void
└── compact: boolean

ApprovalVoteDialog
├── approval: Approval
├── decision: 'APPROVE' | 'REJECT'
├── onConfirm: (reason?: string) => void
└── onCancel: () => void

ApprovalTimeline
├── approval: Approval
└── Events rendered chronologically

// User components
UserTable
├── users: User[]
├── onApprove: (ids: string[]) => void
├── onDeny: (ids: string[]) => void
├── onFreeze: (ids: string[]) => void
├── onUnfreeze: (ids: string[]) => void
└── selectable: boolean

UserCard
├── user: User
├── actions: boolean
└── detailed: boolean

// Notification components
NotificationBell
├── count: number
├── onClick: () => void
└── Animated badge when count > 0

NotificationList
├── notifications: Notification[]
├── onMarkRead: (id: string) => void
├── onMarkAllRead: () => void
└── onNavigate: (url: string) => void
```

---

## 10. Real-time Features

### WebSocket Integration (Future)

```typescript
// src/lib/websocket/client.ts

interface WebSocketMessage {
  type: 'NOTIFICATION' | 'APPROVAL_UPDATE' | 'SYSTEM_ALERT';
  payload: unknown;
}

class WebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(token: string) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'wss://api.gxcoin.money/ws';
    this.socket = new WebSocket(`${wsUrl}?token=${token}`);

    this.socket.onmessage = (event) => {
      const message: WebSocketMessage = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.socket.onclose = () => {
      this.reconnect(token);
    };
  }

  private handleMessage(message: WebSocketMessage) {
    switch (message.type) {
      case 'NOTIFICATION':
        // Update notification store
        break;
      case 'APPROVAL_UPDATE':
        // Invalidate approval queries
        break;
      case 'SYSTEM_ALERT':
        // Show toast notification
        break;
    }
  }

  private reconnect(token: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        this.connect(token);
      }, Math.pow(2, this.reconnectAttempts) * 1000);
    }
  }
}
```

### Polling Fallback

```typescript
// For MVP, use polling instead of WebSocket

// In dashboard layout
useEffect(() => {
  const pollInterval = setInterval(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['approvals', 'pending-count'] });
  }, 30000); // Poll every 30 seconds

  return () => clearInterval(pollInterval);
}, []);
```

---

## 11. Error Handling & UX

### Error Boundary

```typescript
// src/components/shared/error-boundary.tsx

'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Log to error reporting service
    console.error('Error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground text-center max-w-md">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
```

### Toast Notifications

```typescript
// Standardized toast messages

const toastMessages = {
  approval: {
    created: 'Approval request created successfully',
    approved: 'Request approved successfully',
    rejected: 'Request rejected',
    cancelled: 'Request cancelled',
    error: 'Failed to process approval request',
  },
  user: {
    approved: 'User approved successfully',
    denied: 'User registration denied',
    frozen: 'User account frozen',
    unfrozen: 'User account unfrozen',
  },
  auth: {
    loginSuccess: 'Welcome back!',
    loginError: 'Invalid credentials',
    logoutSuccess: 'Logged out successfully',
    sessionExpired: 'Your session has expired. Please log in again.',
    mfaRequired: 'Please enter your MFA code',
  },
};
```

### Loading States

```typescript
// Consistent loading patterns

// Page level
export default function ApprovalsPage() {
  const { data, isLoading, error } = useApprovals();

  if (isLoading) {
    return <LoadingSkeleton variant="table" count={5} />;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  if (data.approvals.length === 0) {
    return (
      <Empty
        icon={ClipboardList}
        title="No approvals yet"
        description="When approval requests are created, they will appear here."
      />
    );
  }

  return <ApprovalList approvals={data.approvals} />;
}

// Button level
<Button disabled={isLoading}>
  {isLoading ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Processing...
    </>
  ) : (
    'Submit'
  )}
</Button>
```

---

## 12. Testing Strategy

### Unit Tests (Vitest)

```typescript
// src/hooks/__tests__/use-approvals.test.ts

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useApprovals, usePendingApprovalsCount } from '../use-approvals';
import { server } from '@/tests/mocks/server';
import { rest } from 'msw';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    {children}
  </QueryClientProvider>
);

describe('useApprovals', () => {
  it('should fetch approvals list', async () => {
    const { result } = renderHook(() => useApprovals(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data.approvals).toHaveLength(3);
  });

  it('should handle error state', async () => {
    server.use(
      rest.get('/api/v1/admin/approvals', (req, res, ctx) => {
        return res(ctx.status(500), ctx.json({ message: 'Server error' }));
      })
    );

    const { result } = renderHook(() => useApprovals(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
```

### Integration Tests (Playwright)

```typescript
// tests/e2e/approval-workflow.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Approval Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Login as SUPER_OWNER
    await page.goto('/login');
    await page.fill('[name="username"]', 'superowner');
    await page.fill('[name="password"]', 'TempPass2025xGX');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard/**');
  });

  test('should approve a pending request', async ({ page }) => {
    await page.goto('/dashboard/approvals');

    // Click approve on first pending item
    await page.click('tr:first-child button:has-text("Approve")');

    // Confirm in dialog
    await page.click('button:has-text("Confirm Approval")');

    // Check success toast
    await expect(page.locator('.toast')).toContainText('Request approved');

    // Verify status changed
    await expect(page.locator('tr:first-child')).toContainText('APPROVED');
  });

  test('should reject with reason', async ({ page }) => {
    await page.goto('/dashboard/approvals');

    await page.click('tr:first-child button:has-text("Reject")');
    await page.fill('[name="reason"]', 'Insufficient documentation');
    await page.click('button:has-text("Confirm Rejection")');

    await expect(page.locator('.toast')).toContainText('Request rejected');
  });
});
```

---

## 13. Deployment & DevOps

### Environment Configuration

```bash
# .env.example

# API Configuration
NEXT_PUBLIC_API_URL=https://api.gxcoin.money
NEXT_PUBLIC_WS_URL=wss://api.gxcoin.money/ws

# Environment
NEXT_PUBLIC_ENVIRONMENT=production  # production | testnet | devnet

# Feature Flags
NEXT_PUBLIC_ENABLE_MFA=true
NEXT_PUBLIC_ENABLE_WEBSOCKET=false  # Enable when WS backend ready

# Monitoring
NEXT_PUBLIC_SENTRY_DSN=https://...
```

### Docker Configuration

```dockerfile
# Dockerfile

FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
```

### Kubernetes Deployment

```yaml
# k8s/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: gx-admin-dashboard
  namespace: backend-mainnet
spec:
  replicas: 2
  selector:
    matchLabels:
      app: gx-admin-dashboard
  template:
    metadata:
      labels:
        app: gx-admin-dashboard
    spec:
      containers:
        - name: gx-admin-dashboard
          image: registry.gxcoin.internal/gx-admin-dashboard:latest
          ports:
            - containerPort: 3000
          env:
            - name: NEXT_PUBLIC_API_URL
              value: "https://api.gxcoin.money"
            - name: NEXT_PUBLIC_ENVIRONMENT
              value: "production"
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: gx-admin-dashboard
  namespace: backend-mainnet
spec:
  selector:
    app: gx-admin-dashboard
  ports:
    - port: 80
      targetPort: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: gx-admin-ingress
  namespace: backend-mainnet
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - admin.gxcoin.money
      secretName: gx-admin-tls
  rules:
    - host: admin.gxcoin.money
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: gx-admin-dashboard
                port:
                  number: 80
```

---

## 14. Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Objective:** Set up project structure and core authentication

| Task | Priority | Effort |
|------|----------|--------|
| Initialize Next.js 15 project | High | 2h |
| Configure Tailwind CSS 4 + Shadcn/UI | High | 4h |
| Set up TypeScript strict mode | High | 1h |
| Implement API client with interceptors | High | 4h |
| Build auth store (Zustand) | High | 4h |
| Create login page | High | 4h |
| Create MFA verification page | High | 4h |
| Implement token management | High | 4h |
| Build dashboard layout shell | High | 6h |
| Set up route protection | High | 4h |

**Deliverable:** Working login flow with protected dashboard shell

---

### Phase 2: Core Dashboard (Week 3-4)

**Objective:** Build main dashboard and approval workflow

| Task | Priority | Effort |
|------|----------|--------|
| Dashboard overview page | High | 8h |
| Stats cards component | High | 4h |
| Pending approvals widget | High | 6h |
| System health widget | Medium | 4h |
| Recent activity feed | Medium | 4h |
| Approvals list page | High | 8h |
| Approval detail page | High | 6h |
| Approval vote dialog | High | 4h |
| Create approval form | High | 6h |
| Approval timeline component | Medium | 4h |

**Deliverable:** Fully functional approval workflow

---

### Phase 3: User Management (Week 5-6)

**Objective:** Complete user and admin management features

| Task | Priority | Effort |
|------|----------|--------|
| User list page with data table | High | 8h |
| User filters and search | High | 4h |
| User detail page | High | 6h |
| User actions (approve/deny/freeze) | High | 6h |
| Pending users tab | High | 4h |
| Frozen users tab | High | 4h |
| Batch on-chain registration | Medium | 6h |
| Admin list page | High | 6h |
| Create admin form | High | 6h |
| Admin role management | High | 4h |

**Deliverable:** Complete user and admin management

---

### Phase 4: Notifications & Audit (Week 7-8)

**Objective:** Notification center and audit log viewer

| Task | Priority | Effort |
|------|----------|--------|
| Notification center page | High | 6h |
| Notification bell component | High | 4h |
| Real-time notification polling | Medium | 4h |
| Mark as read functionality | High | 2h |
| Webhook management page | Medium | 6h |
| Webhook create/edit form | Medium | 4h |
| Audit log list page | High | 8h |
| Audit log filters | High | 4h |
| Audit log detail view | Medium | 4h |
| Audit log export | Medium | 4h |

**Deliverable:** Full notification and audit capabilities

---

### Phase 5: System & Settings (Week 9-10)

**Objective:** System management and user settings

| Task | Priority | Effort |
|------|----------|--------|
| System status page | High | 6h |
| System pause/resume controls | High | 4h |
| Configuration management | Medium | 6h |
| Country management | Medium | 4h |
| Treasury overview page | High | 6h |
| Treasury transfer form | High | 4h |
| User profile settings | High | 4h |
| Security settings (MFA, password) | High | 8h |
| Active sessions management | High | 4h |
| Theme preferences | Low | 2h |

**Deliverable:** Complete system management and settings

---

### Phase 6: Polish & Deploy (Week 11-12)

**Objective:** Testing, optimization, and deployment

| Task | Priority | Effort |
|------|----------|--------|
| Write unit tests | High | 16h |
| Write E2E tests | High | 12h |
| Performance optimization | High | 8h |
| Accessibility audit | Medium | 4h |
| Security audit | High | 8h |
| Docker configuration | High | 4h |
| Kubernetes manifests | High | 4h |
| CI/CD pipeline | High | 6h |
| Documentation | Medium | 8h |
| Production deployment | High | 4h |

**Deliverable:** Production-ready admin dashboard

---

## Summary

### Total Estimated Effort

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1: Foundation | 2 weeks | 37 hours |
| Phase 2: Core Dashboard | 2 weeks | 54 hours |
| Phase 3: User Management | 2 weeks | 54 hours |
| Phase 4: Notifications & Audit | 2 weeks | 46 hours |
| Phase 5: System & Settings | 2 weeks | 48 hours |
| Phase 6: Polish & Deploy | 2 weeks | 74 hours |
| **Total** | **12 weeks** | **313 hours** |

### Key Deliverables

1. **Secure Authentication** - JWT + MFA + session management
2. **Approval Workflow** - Full multi-signature approval system
3. **User Management** - Complete user lifecycle management
4. **Admin Management** - RBAC-based admin controls
5. **Notifications** - Real-time notification center with webhooks
6. **Audit Logs** - Comprehensive audit trail viewer
7. **System Controls** - Pause/resume, configuration, treasury
8. **Production Ready** - Tested, optimized, deployed

### Technology Highlights

- **Next.js 15** with App Router and Server Components
- **TypeScript** in strict mode for type safety
- **Tailwind CSS 4** for modern styling
- **Shadcn/UI** for accessible components
- **TanStack Query** for efficient data fetching
- **Zustand** for lightweight state management
- **Zod** for runtime validation
- **Vitest + Playwright** for comprehensive testing

---

*Document prepared for GX Protocol Admin Dashboard implementation*
