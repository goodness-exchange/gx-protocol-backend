# GX Protocol Development Workflow

## Overview

This document defines the development workflow for GX Protocol, covering local development, testing, and promotion to production environments.

## Environment Tiers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ENVIRONMENT TIERS                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   LOCAL DEV          TESTNET (K8s)           MAINNET (K8s)              │
│   ──────────         ────────────────        ────────────────           │
│   • Fast iteration   • Integration test      • Production               │
│   • Hot reload       • Shared state          • Real users               │
│   • Own database     • Fabric testnet        • Fabric mainnet           │
│   • Mock/real APIs   • Full E2E testing      • High availability        │
│                                                                          │
│   Developer's        srv1117946              srv1089618 (MY)            │
│   Machine            (Malaysia)              srv1089624 (US)            │
│                                              srv1092158 (DE)            │
│                                                                          │
│   Branch: feature/*  Branch: dev             Branch: main               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## 1. Local Development (Fastest Iteration)

### What Runs Locally
- Backend services (svc-identity, svc-tokenomics, etc.)
- Frontend (Next.js dev server)
- Local PostgreSQL database
- Local Redis instance

### What Runs in Kubernetes (Port-Forwarded)
- Hyperledger Fabric network (blockchain)
- Optionally: Use testnet database for realistic data

### Setup Commands

```bash
# Terminal 1: Start local infrastructure
cd gx-protocol-backend
./scripts/dev-local-start.sh

# Terminal 2: Start backend services
cd gx-protocol-backend
npm run dev

# Terminal 3: Start frontend
cd gx-wallet-frontend
npm run dev
```

### Environment Configuration

**Backend (.env.local)**:
```env
NODE_ENV=development
DATABASE_URL=postgresql://gx_admin:localpassword@localhost:5432/gx_protocol_dev
REDIS_URL=redis://localhost:6379

# Fabric connection (port-forwarded from testnet)
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_ORDERER_ENDPOINT=localhost:7050
```

**Frontend (.env.local)**:
```env
NEXT_PUBLIC_IDENTITY_API_URL=http://localhost:3001
NEXT_PUBLIC_TOKENOMICS_API_URL=http://localhost:3003
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:3006

# Feature flags for development
NEXT_PUBLIC_FEATURE_EMAIL_VERIFICATION=false
NEXT_PUBLIC_FEATURE_PHONE_VERIFICATION=false
NEXT_PUBLIC_FEATURE_DEV_OTP_HINT=true
```

### Benefits
- **Hot reload**: Code changes reflect instantly
- **Fast feedback**: No Docker builds, no K8s deployments
- **Debugging**: Full IDE debugger support
- **Isolation**: Won't affect other developers

---

## 2. Testnet Deployment (Integration Testing)

### Purpose
- Test full integration with Fabric blockchain
- Test with realistic data
- Multi-developer shared environment
- Pre-production validation

### Infrastructure
- **Node**: srv1117946 (Malaysia)
- **Namespaces**: `fabric-testnet`, `backend-testnet`
- **Database**: Separate PostgreSQL instance
- **Blockchain**: Isolated Fabric network

### Deployment Process

```bash
# 1. Build and deploy to testnet
cd gx-protocol-backend
./scripts/deploy-testnet.sh <service-name> <version>

# Example:
./scripts/deploy-testnet.sh svc-identity 2.0.26
```

### When to Deploy to Testnet
- Feature branch is complete and code-reviewed
- Local testing passed
- Ready for integration testing
- Before merging to `dev` branch

---

## 3. Mainnet Deployment (Production)

### Purpose
- Production environment
- Real user traffic
- High availability (3 nodes across regions)

### Infrastructure
- **Nodes**: srv1089618 (MY), srv1089624 (US), srv1092158 (DE)
- **Namespaces**: `fabric`, `backend-mainnet`
- **Replicas**: 3 per service (one per region)

### Deployment Process

```bash
# 1. Build production image
cd gx-protocol-backend
./scripts/build-image.sh <service-name> <version>

# 2. Transfer to all nodes
./scripts/transfer-images.sh <service-name> <version>

# 3. Rolling update
./scripts/deploy-mainnet.sh <service-name> <version>
```

### When to Deploy to Mainnet
- Testnet validation complete
- QA sign-off received
- `dev` branch merged to `main`
- Release tagged

---

## Git Branch Strategy

```
main (production)
 │
 └── dev (testnet staging)
      │
      ├── feature/registration-validation
      ├── feature/kyc-improvements
      └── fix/duplicate-email-error
```

### Branch Rules

| Branch | Deploys To | Auto Deploy | Protection |
|--------|-----------|-------------|------------|
| `feature/*` | Local only | No | None |
| `dev` | Testnet | Optional | PR required |
| `main` | Mainnet | Manual | PR + Review required |

---

## Development Workflow

### Day-to-Day Development

```
1. Create feature branch
   git checkout dev
   git pull
   git checkout -b feature/my-feature

2. Develop locally (fast iteration)
   npm run dev
   # Make changes, test instantly

3. Commit frequently
   git add .
   git commit -m "feat: add feature X"

4. When ready for integration testing
   git push origin feature/my-feature
   # Deploy to testnet for E2E testing
   ./scripts/deploy-testnet.sh svc-identity 2.0.x

5. Create PR to dev
   # Get code review
   # Merge when approved

6. Testnet validation
   # QA tests on testnet
   # Fix any issues found

7. Create PR to main
   # Final review
   # Merge for production release

8. Deploy to mainnet
   ./scripts/deploy-mainnet.sh svc-identity 2.0.x
```

---

## Quick Reference

### Start Local Development

```bash
# Backend (from gx-protocol-backend/)
./scripts/dev-local-start.sh  # Starts DB, Redis, port-forwards Fabric
npm run dev                    # Starts all services with hot reload

# Frontend (from gx-wallet-frontend/)
npm run dev                    # Starts Next.js dev server
```

### Deploy to Testnet

```bash
./scripts/deploy-testnet.sh <service> <version>
# Example: ./scripts/deploy-testnet.sh svc-identity 2.0.26
```

### Deploy to Mainnet

```bash
./scripts/deploy-mainnet.sh <service> <version>
# Example: ./scripts/deploy-mainnet.sh svc-identity 2.0.26
```

### Check Service Status

```bash
# Testnet
kubectl get pods -n backend-testnet

# Mainnet
kubectl get pods -n backend-mainnet
```

### View Logs

```bash
# Testnet
kubectl logs -f deploy/svc-identity -n backend-testnet

# Mainnet
kubectl logs -f deploy/svc-identity -n backend-mainnet
```

---

## Environment Variables Summary

| Variable | Local | Testnet | Mainnet |
|----------|-------|---------|---------|
| `NODE_ENV` | development | production | production |
| `DATABASE_URL` | localhost:5432 | postgres-primary.backend-testnet | postgres-primary.backend-mainnet |
| `REDIS_URL` | localhost:6379 | redis-master.backend-testnet | redis-master.backend-mainnet |
| `FABRIC_PEER` | localhost:7051 (forwarded) | peer0-org1.fabric-testnet | peer0-org1.fabric |
| `LOG_LEVEL` | debug | info | info |

---

## Troubleshooting

### Local Development Issues

**Database connection fails:**
```bash
# Check if PostgreSQL is running
docker ps | grep postgres
# Or start local DB
./scripts/dev-local-start.sh
```

**Fabric connection fails:**
```bash
# Check port-forward is active
pgrep -f "port-forward.*7051"
# Restart port-forwards
./scripts/dev-local-start.sh
```

### Testnet/Mainnet Issues

**Pod won't start:**
```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace>
```

**Image not found:**
```bash
# Check image exists on node
ssh root@<node-ip> "k3s ctr images ls | grep <image-name>"
# Transfer if missing
./scripts/transfer-images.sh <service> <version>
```
