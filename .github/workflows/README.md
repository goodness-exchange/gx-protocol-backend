# CI/CD Pipeline Documentation

## Overview

The GX Coin Protocol backend uses a comprehensive CI/CD pipeline built with GitHub Actions. This pipeline ensures code quality, security, and deployment readiness through automated checks and tests.

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Trigger: Push/PR to main, dev, develop                        │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├─► 🔒 Security Scan (Job 1)
             │    ├─ npm audit
             │    ├─ Dependency check
             │    └─ SBOM generation
             │
             ├─► 🔍 Lint & Type Check (Job 2)
             │    ├─ ESLint
             │    ├─ TypeScript type-check
             │    └─ Prettier format check
             │
             ├─► 🧪 Tests (Job 3)
             │    ├─ PostgreSQL (service)
             │    ├─ Redis (service)
             │    ├─ Database migrations
             │    ├─ Unit & integration tests
             │    └─ Coverage upload
             │
             └─► All jobs pass
                  │
                  ├─► 🏗️ Build (Job 4)
                  │    ├─ Build all packages
                  │    ├─ Upload artifacts
                  │    └─ Size analysis
                  │
                  ├─► ⚡ Performance (Job 5) [PR only]
                  │    └─ Bundle size analysis
                  │
                  ├─► 🐳 Docker Build (Job 6) [main/dev only]
                  │    └─ Build Docker images
                  │
                  └─► 📊 Summary (Job 7)
                       └─ Generate report
```

## Jobs Breakdown

### Job 1: 🔒 Security Scan

**Purpose:** Identify security vulnerabilities and track dependencies

**Steps:**
1. **npm audit** - Scan for known vulnerabilities
   - Audit level: high
   - Continue on error for known Fabric SDK issues
2. **Dependency check** - List outdated packages
3. **SBOM generation** - Create Software Bill of Materials
   - Uploaded as artifact for 30 days
   - Useful for compliance and security audits

**When it runs:** On every push/PR

**Artifacts:**
- `sbom.json` - Complete dependency tree

---

### Job 2: 🔍 Lint & Type Check

**Purpose:** Ensure code quality and type safety

**Steps:**
1. **ESLint** - Check code style and catch common errors
2. **TypeScript type-check** - Verify type safety across all packages
3. **Prettier** - Verify code formatting consistency

**When it runs:** On every push/PR

**Failure conditions:**
- ESLint errors
- TypeScript type errors
- Formatting violations

---

### Job 3: 🧪 Tests

**Purpose:** Run comprehensive test suite with real services

**Service Containers:**
- **PostgreSQL 15** - Database for integration tests
  - User: gxuser
  - Password: gxpass
  - Database: gxprotocol_test
  - Port: 5432
  - Health checks enabled
  
- **Redis 7** - Cache for integration tests
  - Port: 6379
  - Health checks enabled

**Steps:**
1. **Generate Prisma client** - Ensure ORM is ready
2. **Run migrations** - Set up test database schema
3. **Run tests with coverage** - Execute all tests
   - Max workers: 2 (for CI environment)
   - Coverage collection enabled
4. **Upload coverage** - Send to Codecov (optional)
5. **Archive results** - Store test results and coverage

**Environment Variables:**
```bash
DATABASE_URL=postgresql://gxuser:gxpass@localhost:5432/gxprotocol_test
REDIS_URL=redis://localhost:6379
NODE_ENV=test
```

**When it runs:** On every push/PR

**Artifacts:**
- Coverage reports (LCOV)
- Test results
- Retention: 30 days

---

### Job 4: 🏗️ Build

**Purpose:** Compile all packages and ensure build succeeds

**Dependencies:** Requires Jobs 1, 2, and 3 to pass

**Steps:**
1. **Generate Prisma client** - Prepare database types
2. **Build all packages** - Compile TypeScript to JavaScript
   - Uses Turborepo for caching
   - Builds in dependency order
3. **Verify build output** - Check dist directories exist
4. **Upload artifacts** - Store compiled code
5. **Calculate sizes** - Report bundle sizes

**When it runs:** Only after all quality checks pass

**Artifacts:**
- Build output from all packages
- Retention: 7 days

**Output:**
- Build size report in GitHub summary

---

### Job 5: ⚡ Performance Check

**Purpose:** Analyze bundle sizes and track performance

**Dependencies:** Requires successful build

**When it runs:** Only on Pull Requests

**Steps:**
1. Download build artifacts
2. Analyze bundle sizes
3. Generate size comparison report

**Output:**
- Bundle size table in PR summary
- Size comparison with base branch

---

### Job 6: 🐳 Docker Build Check

**Purpose:** Verify Docker images can be built

**Dependencies:** Requires successful build

**When it runs:** Only on `main` and `dev` branches

**Strategy:** Matrix build for multiple services

**Steps:**
1. Set up Docker Buildx
2. Build Docker images (no push)
3. Use GitHub cache for layers

**Features:**
- Build cache optimization
- Multi-service support via matrix
- Fails gracefully if Dockerfile doesn't exist

---

### Job 7: 📊 Pipeline Summary

**Purpose:** Generate comprehensive pipeline report

**Dependencies:** Runs after all main jobs (even if they fail)

**When it runs:** Always (on success or failure)

**Output:**
- Pipeline status summary
- Job results table
- Branch and commit information
- Author and trigger details

---

## Configuration

### Environment Variables

**Global:**
```yaml
NODE_VERSION: '18.18.0'      # Match project requirement
TURBO_TOKEN: (optional)       # For Turborepo remote caching
TURBO_TEAM: (optional)        # For Turborepo remote caching
```

**Secrets Required:**
- `CODECOV_TOKEN` - For coverage upload (optional)
- `TURBO_TOKEN` - For Turborepo remote cache (optional)
- `TURBO_TEAM` - For Turborepo team (optional)

### Concurrency Control

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Behavior:**
- Cancels in-progress runs for the same PR/branch
- Saves CI minutes
- Provides faster feedback

---

## Triggers

### Automatic Triggers

**Push events:**
```yaml
branches: [main, dev, develop]
```

**Pull request events:**
```yaml
branches: [main, dev, develop]
```

### Manual Trigger

```yaml
workflow_dispatch:
```

**How to use:**
1. Go to Actions tab
2. Select "CI/CD Pipeline"
3. Click "Run workflow"
4. Select branch
5. Click "Run workflow"

---

## Best Practices

### 1. Always Run Locally First

Before pushing, run these commands:
```bash
npm run lint          # Check code style
npm run type-check    # Verify types
npm test              # Run tests
npm run build         # Ensure build works
```

### 2. Keep Commits Small

- Smaller commits = faster CI feedback
- Easier to identify failures
- Better for code review

### 3. Monitor CI Times

- **Target:** < 10 minutes total
- **Current breakdown:**
  - Security: ~1 min
  - Lint/Type: ~2 min
  - Tests: ~3-5 min
  - Build: ~2 min

### 4. Use Cache Effectively

The pipeline caches:
- npm packages
- Turborepo build cache
- Docker layers

This significantly speeds up subsequent runs.

### 5. Review Artifacts

Download artifacts to debug failures:
- Test results and coverage
- Build outputs
- SBOM for security review

---

## Troubleshooting

### Common Issues

#### 1. **npm audit failing**

**Symptom:** Security scan job fails
**Cause:** New vulnerabilities detected
**Solution:**
```bash
npm audit fix          # Auto-fix if possible
npm audit --json       # Review details
```

#### 2. **Type-check failures**

**Symptom:** Lint job fails on TypeScript
**Cause:** Type errors in code
**Solution:**
```bash
npm run type-check     # Run locally
# Fix reported errors
```

#### 3. **Test failures with services**

**Symptom:** Tests fail in CI but pass locally
**Cause:** Service container not ready
**Solution:**
- Health checks ensure services are ready
- Check `DATABASE_URL` and `REDIS_URL` are correct
- Verify migrations ran successfully

#### 4. **Build cache issues**

**Symptom:** Slow builds or outdated artifacts
**Solution:**
```bash
# Clear Turborepo cache
npx turbo clean

# Rebuild from scratch
npm run build
```

#### 5. **Docker build failures**

**Symptom:** Docker job fails
**Cause:** Dockerfile doesn't exist or has errors
**Solution:**
- Job continues on error (won't fail pipeline)
- Will be fixed when Dockerfiles are created in Task 0.4

---

## Performance Optimization

### Current Optimizations

1. **Parallel Job Execution**
   - Jobs 1, 2, 3 run in parallel
   - Only build waits for all to complete
   
2. **npm Cache**
   - `actions/setup-node@v4` with `cache: 'npm'`
   - Caches node_modules across runs
   
3. **Turborepo Cache**
   - Skips rebuilding unchanged packages
   - Local and remote caching support
   
4. **Docker Layer Cache**
   - Uses GitHub cache for Docker layers
   - Speeds up subsequent builds
   
5. **Concurrency Control**
   - Cancels outdated runs
   - Saves CI minutes

### Future Optimizations

- [ ] Implement test splitting for faster parallel execution
- [ ] Add remote Turborepo cache
- [ ] Use composite actions for repeated steps
- [ ] Implement selective test running based on changed files

---

## Security

### Vulnerability Scanning

**npm audit:**
- Scans all dependencies
- Fails on high/critical vulnerabilities
- Continues on known issues (Fabric SDK)

**SBOM Generation:**
- Creates complete dependency list
- Helps with compliance requirements
- Useful for security audits

### Secrets Management

**Never commit:**
- API keys
- Passwords
- Tokens
- Private keys

**Use GitHub Secrets:**
1. Go to repository Settings
2. Secrets and variables → Actions
3. New repository secret
4. Add secret name and value

### Dependency Updates

**Automated:**
- Dependabot will create PRs for updates
- Review and merge carefully

**Manual:**
```bash
npm outdated           # Check for updates
npm update             # Update to latest allowed
npm audit fix          # Fix vulnerabilities
```

---

## Monitoring & Alerts

### GitHub Notifications

**Email notifications for:**
- Failed workflow runs
- First workflow run on new branch
- Workflow run requested by you

**Configure:**
Settings → Notifications → Actions

### Status Badges

Add to README.md:
```markdown
![CI/CD Pipeline](https://github.com/goodness-exchange/gx-protocol-backend/workflows/CI%2FCD%20Pipeline/badge.svg)
```

### Workflow Insights

**View:**
1. Actions tab
2. Select workflow run
3. View jobs and steps
4. Download logs/artifacts

---

## Future Enhancements (Phase 4)

- [ ] Performance regression testing
- [ ] Visual regression testing
- [ ] Load testing with k6
- [ ] E2E testing with Playwright
- [ ] Deployment to staging environment
- [ ] Canary deployments
- [ ] Rollback automation
- [ ] Slack/Discord notifications

---

## Related Documentation

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Turborepo Caching](https://turbo.build/repo/docs/core-concepts/caching)
- [Codecov Documentation](https://docs.codecov.com/)
- [Docker Build Actions](https://github.com/docker/build-push-action)

---

**Last Updated:** October 15, 2025  
**Maintained By:** GX Protocol Development Team  
**Status:** Task 0.3 Complete