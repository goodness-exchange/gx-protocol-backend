# Environment Variables Reference

> **LIVING DOCUMENT**: Update after any environment variable changes.
> Last Updated: 2025-12-24T05:45:00Z

## Overview

This document provides a comprehensive reference of all environment variables used across GX Protocol services.

---

## 1. Common Variables (All Services)

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| NODE_ENV | string | Yes | Runtime environment: development, production |
| LOG_LEVEL | string | No | Logging level: debug, info, warn, error |
| PORT | number | Yes | Service listening port |

---

## 2. Database Variables

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| DATABASE_URL | string | Yes | PostgreSQL connection string |
| DB_HOST | string | Alt | Database host (if not using URL) |
| DB_PORT | number | Alt | Database port (default: 5432) |
| DB_NAME | string | Alt | Database name |
| DB_USER | string | Alt | Database username |
| DB_PASSWORD | string | Alt | Database password (from secret) |

### Connection Strings by Environment

| Environment | Host | Port | Database |
|-------------|------|------|----------|
| DevNet | postgres-primary.backend-devnet.svc.cluster.local | 5432 | gx_protocol |
| TestNet | postgres-primary.backend-testnet.svc.cluster.local | 5432 | gx_protocol |
| MainNet | postgres-primary.backend-mainnet.svc.cluster.local | 5432 | gx_protocol |

---

## 3. Redis Variables

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| REDIS_URL | string | Yes | Redis connection string |
| REDIS_HOST | string | Alt | Redis host |
| REDIS_PORT | number | Alt | Redis port (default: 6379) |
| REDIS_PASSWORD | string | No | Redis password (from secret) |

### Connection Strings by Environment

| Environment | Host | Port | Mode |
|-------------|------|------|------|
| DevNet | redis.backend-devnet.svc.cluster.local | 6379 | Standalone |
| TestNet | redis.backend-testnet.svc.cluster.local | 6379 | Standalone |
| MainNet | redis.backend-mainnet.svc.cluster.local | 6379 | Sentinel |

---

## 4. JWT/Authentication Variables

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| JWT_SECRET | string | Yes | Secret for signing JWTs (from secret) |
| JWT_EXPIRES_IN | string | No | Token expiration (default: 15m) |
| JWT_REFRESH_EXPIRES_IN | string | No | Refresh token expiration (default: 7d) |
| ADMIN_JWT_SECRET | string | Yes | Admin JWT secret (from secret) |

---

## 5. Fabric Variables

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| FABRIC_CHANNEL_NAME | string | Yes | Hyperledger Fabric channel |
| FABRIC_CHAINCODE_NAME | string | Yes | Chaincode name |
| FABRIC_MSP_ID | string | Yes | Organization MSP ID |
| FABRIC_PEER_ENDPOINT | string | Yes | Peer gRPC endpoint |
| FABRIC_ORDERER_ENDPOINT | string | Yes | Orderer gRPC endpoint |
| FABRIC_CA_ENDPOINT | string | Yes | Certificate Authority endpoint |
| FABRIC_WALLET_PATH | string | No | Path to wallet credentials |

### Fabric Endpoints by Environment

| Environment | Peer | Orderer | Channel |
|-------------|------|---------|---------|
| DevNet | peer0.org1.gxcoin.dev:7051 | orderer.gxcoin.dev:7050 | gxchannel |
| TestNet | peer0.org1.gxcoin.test:7051 | orderer.gxcoin.test:7050 | gxchannel |
| MainNet | peer0.org1.gxcoin.money:7051 | orderer.gxcoin.money:7050 | gxchannel |

---

## 6. Service-Specific Variables

### svc-admin

| Variable | Value | Description |
|----------|-------|-------------|
| PORT | 3006 | Service port |
| ADMIN_TOKEN_EXPIRY | 900 | Admin token expiry in seconds (15 min) |
| ADMIN_REFRESH_EXPIRY | 604800 | Refresh token expiry (7 days) |
| MFA_ISSUER | GXCoin Admin | TOTP issuer name |
| APPROVAL_EXPIRY_HOURS | 72 | Approval request expiry |

### svc-identity

| Variable | Value | Description |
|----------|-------|-------------|
| PORT | 3001 | Service port |
| USER_TOKEN_EXPIRY | 3600 | User token expiry in seconds |
| EMAIL_VERIFICATION_EXPIRY | 86400 | Email verification expiry (24h) |
| PASSWORD_RESET_EXPIRY | 3600 | Password reset expiry (1h) |

### svc-tokenomics

| Variable | Value | Description |
|----------|-------|-------------|
| PORT | 3005 | Service port |
| TRANSFER_TIMEOUT | 30000 | Transfer timeout in ms |
| MAX_TRANSFER_AMOUNT | 1000000 | Maximum single transfer |
| DAILY_LIMIT | 10000000 | Daily transfer limit |

### gx-wallet-frontend

| Variable | Value | Description |
|----------|-------|-------------|
| PORT | 3000 | Next.js port |
| NEXT_PUBLIC_API_URL | /api | API base URL |
| NEXT_PUBLIC_IDENTITY_URL | /api/v1/identity | Identity service URL |

---

## 7. Secrets Reference

Secrets are stored in Kubernetes Secrets and mounted as environment variables.

| Secret Name | Namespace | Keys |
|-------------|-----------|------|
| postgres-credentials | backend-* | username, password |
| redis-secret | backend-* | password |
| jwt-secrets | backend-* | jwt-secret, admin-jwt-secret |
| fabric-credentials | backend-* | (certificate files) |
| admin-credentials | backend-* | super-owner-password |

---

## 8. Port Reference Summary

| Service | Container Port | K8S Service Port | Dockerfile EXPOSE |
|---------|---------------|------------------|-------------------|
| svc-admin | 3006 | 80 | 3006 |
| svc-identity | 3001 | 80 | 3001 |
| svc-tokenomics | 3005 | 80 | 3005 |
| svc-governance | 3002 | 80 | 3002 |
| svc-loanpool | 3003 | 80 | 3003 |
| svc-tax | 3004 | 80 | 3004 |
| svc-organization | 3007 | 80 | 3007 |
| gx-wallet-frontend | 3000 | 80 | - |
| outbox-submitter | 3003 | 9090 | - |
| projector | 3004 | 9091 | - |

---

*Update this document when adding or modifying environment variables.*
