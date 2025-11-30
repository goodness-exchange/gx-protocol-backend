# Lecture 09: Monorepo Architecture with Turborepo

**Course:** GX Protocol Backend Architecture
**Module:** Project Structure & Build Systems
**Duration:** 90 minutes
**Level:** Intermediate
**Prerequisites:** Node.js/npm basics, TypeScript familiarity

---

## Table of Contents

1. [Learning Objectives](#learning-objectives)
2. [Part I: Introduction to Monorepos](#part-i-introduction-to-monorepos)
3. [Part II: NPM Workspaces](#part-ii-npm-workspaces)
4. [Part III: Turborepo Fundamentals](#part-iii-turborepo-fundamentals)
5. [Part IV: GX Protocol Repository Structure](#part-iv-gx-protocol-repository-structure)
6. [Part V: Shared Packages (core-*)](#part-v-shared-packages-core-)
7. [Part VI: Dependency Management](#part-vi-dependency-management)
8. [Part VII: Build Orchestration](#part-vii-build-orchestration)
9. [Part VIII: Development Workflow](#part-viii-development-workflow)
10. [Exercises](#exercises)
11. [Further Reading](#further-reading)

---

## Learning Objectives

By the end of this lecture, you will be able to:

1. Explain the benefits and trade-offs of monorepo architecture
2. Configure NPM workspaces for multi-package projects
3. Use Turborepo for build orchestration
4. Design shared packages for code reuse
5. Manage dependencies in a monorepo
6. Optimize build performance with caching

---

## Part I: Introduction to Monorepos

### 1.1 What is a Monorepo?

A **monorepo** (mono repository) is a single repository containing multiple distinct projects or packages that may or may not be related.

```
MONOREPO vs POLYREPO:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  POLYREPO (Traditional):                                                │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               │
│  │ repo-api      │  │ repo-worker   │  │ repo-utils    │               │
│  │               │  │               │  │               │               │
│  │ package.json  │  │ package.json  │  │ package.json  │               │
│  │ node_modules/ │  │ node_modules/ │  │ node_modules/ │               │
│  └───────────────┘  └───────────────┘  └───────────────┘               │
│        ↓                   ↓                                            │
│   npm publish         npm publish      npm install repo-utils          │
│        └────────────────────────────────────┘                           │
│                                                                         │
│  MONOREPO (GX Protocol):                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ gx-protocol-backend/                                            │   │
│  │  ├── apps/svc-identity/    (imports @gx/core-http)              │   │
│  │  ├── apps/svc-tokenomics/  (imports @gx/core-http)              │   │
│  │  ├── workers/projector/    (imports @gx/core-fabric)            │   │
│  │  ├── packages/core-http/   (shared middleware)                  │   │
│  │  ├── packages/core-fabric/ (shared blockchain client)           │   │
│  │  └── node_modules/         (single node_modules at root)        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Benefits of Monorepos

| Benefit | Description |
|---------|-------------|
| **Atomic commits** | Change multiple packages in a single commit |
| **Code sharing** | Share utilities without publishing to npm |
| **Consistent tooling** | Same linting, testing, formatting across all packages |
| **Easier refactoring** | Rename across codebase with IDE support |
| **Simplified dependencies** | Single lock file, deduplicated packages |
| **Cross-project testing** | Test integration between services easily |

### 1.3 Challenges of Monorepos

| Challenge | Mitigation |
|-----------|------------|
| **Large repository size** | Use shallow clones, sparse checkout |
| **Slow builds** | Turborepo caching, incremental builds |
| **Complex CI/CD** | Affected-only testing, parallel jobs |
| **Access control** | CODEOWNERS, branch protection |
| **Dependency conflicts** | Strict version management |

### 1.4 When to Use a Monorepo

```
USE MONOREPO WHEN:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ✅ Multiple services share significant code                            │
│  ✅ Team works across multiple packages regularly                        │
│  ✅ Tight coupling between services (microservices in same domain)      │
│  ✅ Consistent tooling and standards are important                      │
│  ✅ Atomic changes across packages are common                           │
│                                                                         │
│  Example: GX Protocol backend - 7 services sharing:                     │
│  - Database schemas (Prisma)                                            │
│  - HTTP middleware (Express)                                            │
│  - Blockchain client (Fabric SDK)                                       │
│  - Event schemas (JSON Schema)                                          │
│  - Configuration management (Zod)                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

USE POLYREPO WHEN:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ❌ Teams are independent and rarely collaborate                         │
│  ❌ Services have no shared code                                         │
│  ❌ Different technology stacks (Node.js + Python + Go)                  │
│  ❌ Different release cycles and versioning                              │
│  ❌ Security boundaries require separate access control                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part II: NPM Workspaces

### 2.1 What are NPM Workspaces?

NPM Workspaces (npm 7+) allow managing multiple packages in a single repository with a single `package-lock.json`.

### 2.2 Root package.json Configuration

```json
{
  "name": "gx-protocol-backend",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "workers/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "turbo": "^1.13.4",
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "prettier": "^3.1.0"
  }
}
```

### 2.3 Workspace Directory Structure

```
gx-protocol-backend/
├── package.json              # Root package.json with workspaces
├── package-lock.json         # Single lock file for all packages
├── turbo.json                # Turborepo configuration
├── node_modules/             # Shared node_modules (hoisted)
│
├── apps/                     # HTTP microservices
│   ├── svc-identity/
│   │   └── package.json      # @gx/svc-identity
│   ├── svc-tokenomics/
│   │   └── package.json      # @gx/svc-tokenomics
│   ├── svc-organization/
│   ├── svc-loanpool/
│   ├── svc-governance/
│   ├── svc-admin/
│   └── svc-tax/
│
├── workers/                  # Background workers
│   ├── outbox-submitter/
│   │   └── package.json      # @gx/outbox-submitter
│   └── projector/
│       └── package.json      # @gx/projector
│
└── packages/                 # Shared libraries
    ├── core-config/
    │   └── package.json      # @gx/core-config
    ├── core-db/
    │   └── package.json      # @gx/core-db
    ├── core-events/
    │   └── package.json      # @gx/core-events
    ├── core-fabric/
    │   └── package.json      # @gx/core-fabric
    ├── core-http/
    │   └── package.json      # @gx/core-http
    ├── core-logger/
    │   └── package.json      # @gx/core-logger
    └── core-openapi/
        └── package.json      # @gx/core-openapi
```

### 2.4 Workspace Package Naming

```json
// packages/core-config/package.json
{
  "name": "@gx/core-config",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts"
}
```

**Naming Convention:**
- Scope: `@gx/` (organization prefix)
- Packages: `core-*` (shared libraries)
- Apps: `svc-*` (HTTP services)
- Workers: worker name (e.g., `projector`)

### 2.5 Workspace Commands

```bash
# Run command in specific workspace
npm run build --workspace=@gx/svc-identity

# Run command in all workspaces
npm run build --workspaces

# Install dependency in specific workspace
npm install express --workspace=@gx/svc-identity

# Install dev dependency at root
npm install -D typescript

# List all workspaces
npm ls --workspaces
```

---

## Part III: Turborepo Fundamentals

### 3.1 What is Turborepo?

Turborepo is a high-performance build system for JavaScript/TypeScript monorepos. It provides:

- **Incremental builds:** Only rebuild what changed
- **Parallel execution:** Run tasks across packages concurrently
- **Remote caching:** Share build artifacts across machines
- **Dependency graph:** Understand package relationships

### 3.2 turbo.json Configuration

```json
{
  "globalDependencies": ["**/.env.*local", ".env"],
  "globalEnv": [
    "NODE_ENV",
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SECRET",
    "LOG_LEVEL",
    "PORT"
  ],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### 3.3 Pipeline Configuration Explained

| Key | Description | Example |
|-----|-------------|---------|
| `dependsOn` | Tasks that must run first | `["^build"]` = build dependencies first |
| `outputs` | Cached output directories | `["dist/**"]` |
| `cache` | Enable/disable caching | `false` for dev mode |
| `persistent` | Long-running task | `true` for watch mode |

### 3.4 Dependency Syntax

```
^build    = Run build in all dependencies first (topological)
build     = Run build in same package first
//#build  = Run build in root package
```

```
DEPENDENCY GRAPH EXAMPLE:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  turbo run build                                                        │
│                                                                         │
│  ┌─────────────┐                                                        │
│  │ svc-identity│ ─────────────────────────────┐                         │
│  └──────┬──────┘                              │                         │
│         │ depends on                          │ depends on              │
│         ▼                                     ▼                         │
│  ┌─────────────┐                       ┌─────────────┐                  │
│  │  core-http  │                       │   core-db   │                  │
│  └──────┬──────┘                       └──────┬──────┘                  │
│         │ depends on                          │                         │
│         ▼                                     │                         │
│  ┌─────────────┐                              │                         │
│  │ core-logger │◀─────────────────────────────┘                         │
│  └─────────────┘                                                        │
│                                                                         │
│  Build order: core-logger → core-http → core-db → svc-identity         │
│  (Parallel where possible)                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Caching

```bash
# First run: builds everything
$ turbo run build
Tasks:    9 successful, 9 total
Time:     45.2s

# Second run: uses cache
$ turbo run build
Tasks:    9 successful, 9 total
Cached:   9 cached, 9 total
Time:     0.3s  # 150x faster!
```

**Cache invalidation triggers:**
- Source file changes
- Dependency changes
- Environment variable changes
- turbo.json changes

---

## Part IV: GX Protocol Repository Structure

### 4.1 Directory Overview

```
gx-protocol-backend/
│
├── apps/                     # HTTP Microservices
│   ├── svc-identity/         # User auth, profile, KYC
│   ├── svc-tokenomics/       # Transfers, balances
│   ├── svc-organization/     # Multi-sig orgs
│   ├── svc-loanpool/         # Interest-free loans
│   ├── svc-governance/       # Proposals, voting
│   ├── svc-admin/            # System admin
│   └── svc-tax/              # Hoarding tax
│
├── workers/                  # Background Workers
│   ├── outbox-submitter/     # CQRS write path
│   └── projector/            # CQRS read path
│
├── packages/                 # Shared Libraries
│   ├── core-config/          # Environment config
│   ├── core-db/              # Prisma client
│   ├── core-events/          # Event schemas
│   ├── core-fabric/          # Blockchain client
│   ├── core-http/            # Express middleware
│   ├── core-logger/          # Structured logging
│   └── core-openapi/         # OpenAPI validation
│
├── db/                       # Database
│   ├── prisma/
│   │   └── schema.prisma
│   ├── migrations/
│   └── seeds/
│
├── k8s/                      # Kubernetes manifests
│   └── backend/
│
└── docs/                     # Documentation
    ├── lectures/
    ├── adr/
    └── work-records/
```

### 4.2 Package Categories

| Category | Purpose | Location |
|----------|---------|----------|
| **Apps** | HTTP services (Express) | `apps/svc-*` |
| **Workers** | Background processing | `workers/*` |
| **Packages** | Shared code | `packages/core-*` |

### 4.3 Naming Conventions

```
@gx/svc-identity      # Service: user identity
@gx/core-http         # Package: HTTP utilities
@gx/projector         # Worker: event projection
```

---

## Part V: Shared Packages (core-*)

### 5.1 Package Overview

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| `core-config` | Environment configuration | `loadConfig()`, Zod schemas |
| `core-db` | Database client | `prisma`, migration utilities |
| `core-events` | Event validation | `EventValidator`, JSON schemas |
| `core-fabric` | Blockchain client | `FabricClient`, circuit breaker |
| `core-http` | Express middleware | `errorHandler`, `idempotency` |
| `core-logger` | Structured logging | `createLogger()` |
| `core-openapi` | API validation | OpenAPI schemas |

### 5.2 Package Structure

```
packages/core-config/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Public exports
│   ├── schemas.ts        # Zod schemas
│   └── loader.ts         # Config loading
└── dist/                 # Compiled output
    ├── index.js
    ├── index.d.ts
    └── ...
```

### 5.3 Package package.json Pattern

```json
{
  "name": "@gx/core-config",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "type-check": "tsc --noEmit",
    "test": "jest"
  },
  "dependencies": {
    "zod": "^3.22.4",
    "dotenv": "^16.3.1"
  }
}
```

### 5.4 Package tsconfig.json Pattern

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 5.5 Using Shared Packages

```typescript
// apps/svc-identity/src/index.ts

// Import from workspace packages (resolved via npm workspaces)
import { loadConfig } from '@gx/core-config';
import { prisma } from '@gx/core-db';
import { errorHandler, idempotencyMiddleware } from '@gx/core-http';
import { createLogger } from '@gx/core-logger';

const config = loadConfig();
const logger = createLogger('svc-identity');

const app = express();
app.use(errorHandler);
app.use(idempotencyMiddleware);
```

### 5.6 Package Dependencies

```json
// apps/svc-identity/package.json
{
  "name": "@gx/svc-identity",
  "dependencies": {
    "@gx/core-config": "*",    // Workspace dependency
    "@gx/core-db": "*",
    "@gx/core-http": "*",
    "@gx/core-logger": "*",
    "express": "^4.18.2"       // External dependency
  }
}
```

**Note:** Use `"*"` for workspace dependencies. NPM resolves these to the local packages.

---

## Part VI: Dependency Management

### 6.1 Dependency Types

| Type | Location | Purpose |
|------|----------|---------|
| **Root devDeps** | Root package.json | Shared tooling (TypeScript, ESLint) |
| **Package deps** | Package package.json | Runtime dependencies |
| **Workspace deps** | Package package.json | Internal packages (`@gx/*`) |

### 6.2 Hoisting

NPM workspaces **hoist** common dependencies to the root `node_modules`:

```
gx-protocol-backend/
├── node_modules/
│   ├── express/              # Hoisted (used by multiple apps)
│   ├── typescript/           # Hoisted (devDep)
│   └── @gx/
│       ├── core-config/      # Symlink to packages/core-config
│       ├── core-db/          # Symlink to packages/core-db
│       └── ...
│
├── apps/svc-identity/
│   └── node_modules/
│       └── some-unique-dep/  # Not hoisted (only used here)
```

### 6.3 Version Conflicts

```bash
# Check for duplicate versions
npm ls express

# Force single version (in root package.json)
{
  "overrides": {
    "express": "4.18.2"
  }
}
```

### 6.4 Adding Dependencies

```bash
# Add to specific package
npm install axios --workspace=@gx/svc-identity

# Add to root (shared dev dependency)
npm install -D @types/node

# Add to all packages (rarely needed)
npm install lodash --workspaces
```

---

## Part VII: Build Orchestration

### 7.1 Build Commands

```bash
# Build all packages (respecting dependencies)
npm run build
# Equivalent to: turbo run build

# Build specific package
npm run build --filter=@gx/svc-identity

# Build package and its dependencies
npm run build --filter=@gx/svc-identity...

# Build everything that depends on a package
npm run build --filter=...@gx/core-http
```

### 7.2 Development Mode

```bash
# Start all services in dev mode
npm run dev

# Start specific service
npm run dev --filter=@gx/svc-identity
```

### 7.3 Testing

```bash
# Run all tests
npm run test

# Run tests for specific package
npm run test --filter=@gx/core-fabric

# Run tests for changed packages only
npm run test --filter=[origin/main]
```

### 7.4 Linting

```bash
# Lint all packages
npm run lint

# Type check all packages
npm run type-check
```

### 7.5 Cleaning

```bash
# Clean all build outputs
npm run clean

# This runs: turbo run clean && rm -rf node_modules
```

---

## Part VIII: Development Workflow

### 8.1 Initial Setup

```bash
# Clone repository
git clone <repo-url>
cd gx-protocol-backend

# Install all dependencies (single command)
npm install

# Build all packages
npm run build

# Verify setup
npm run type-check
```

### 8.2 Daily Development

```bash
# Start development mode
npm run dev

# In another terminal: run tests in watch mode
npm run test --filter=@gx/svc-identity -- --watch

# Before committing: lint and type check
npm run lint
npm run type-check
```

### 8.3 Adding a New Package

```bash
# Create directory structure
mkdir -p packages/core-newpackage/src
cd packages/core-newpackage

# Initialize package.json
npm init -y

# Update package.json
{
  "name": "@gx/core-newpackage",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist"
  }
}

# Add tsconfig.json
# Add source files
# Run npm install from root to update workspaces
cd ../..
npm install
```

### 8.4 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Type check
        run: npm run type-check

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm run test
```

---

## Exercises

### Exercise 1: Package Creation

Create a new shared package `@gx/core-utils` with the following:
- A `formatCurrency(amount: number)` function
- Proper TypeScript configuration
- Export from index.ts
- Use it in `svc-identity`

### Exercise 2: Dependency Analysis

Use `npm ls` and `turbo run build --graph` to:
1. Visualize the dependency graph
2. Identify which packages depend on `core-http`
3. Determine the build order

### Exercise 3: Turbo Configuration

Modify `turbo.json` to:
1. Add a `format` task that runs Prettier
2. Make it depend on nothing (can run independently)
3. Exclude outputs from cache

### Exercise 4: Affected Testing

Implement a script that:
1. Detects changed files since `main`
2. Finds affected packages
3. Runs tests only for those packages

---

## Further Reading

### Official Documentation

- **NPM Workspaces:** https://docs.npmjs.com/cli/v8/using-npm/workspaces
- **Turborepo:** https://turbo.build/repo/docs
- **TypeScript Project References:** https://www.typescriptlang.org/docs/handbook/project-references.html

### Articles

- **Monorepo vs Polyrepo:** https://www.atlassian.com/git/tutorials/monorepos
- **Turborepo Best Practices:** https://turbo.build/repo/docs/handbook

### Related GX Protocol Documentation

- **docs/adr/001-monorepo-structure.md**
- **LECTURE-10:** Configuration Management with Zod

---

## Summary

In this lecture, we covered:

1. **Monorepo Benefits:** Atomic commits, code sharing, consistent tooling
2. **NPM Workspaces:** Multi-package management with single lock file
3. **Turborepo:** Build orchestration with caching and parallelization
4. **Repository Structure:** Apps, workers, and packages organization
5. **Shared Packages:** The `core-*` library pattern
6. **Dependency Management:** Hoisting, version control, workspace deps
7. **Build Orchestration:** Commands and filters
8. **Development Workflow:** Setup, daily development, CI/CD

**Key Takeaways:**

- Monorepos excel when packages share significant code
- NPM workspaces handle package linking automatically
- Turborepo provides 10-100x build speedups via caching
- Shared packages (`core-*`) enable DRY code across services
- Use `"*"` for workspace dependencies in package.json
- Build order respects dependency graph

**Next Lecture:** LECTURE-10 - Configuration Management with Zod

---

**End of Lecture 09**
