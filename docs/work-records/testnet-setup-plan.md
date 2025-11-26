# Complete Testnet Server Setup Plan - srv1117946

## Goal
Set up srv1117946 as a fully self-contained testnet environment with:
- ✅ Hyperledger Fabric testnet (already running)
- ⏳ PostgreSQL database
- ⏳ Redis cache
- ⏳ Backend services (workers + APIs)
- ⏳ All running on ONE server for ultra-low latency

## Current Status on srv1117946
```
fabric-testnet namespace:
- 3 orderers ✅
- 2 peers (org1, org2) ✅
- 2 CouchDB instances ✅
- gxtv3 chaincode ✅
```

## What Needs to Move to srv1117946

### 1. Docker Images (In Progress)
- gx-protocol/svc-admin:2.0.14
- gx-protocol/svc-identity:2.0.14
- gx-protocol/svc-tokenomics:2.0.14
- gx-protocol/outbox-submitter:2.0.13
- gx-protocol/projector:2.0.11

### 2. Databases
- PostgreSQL StatefulSet (100Gi storage)
- Redis StatefulSet (20Gi storage)

### 3. Backend Services (1 replica each for testnet)
- outbox-submitter
- projector  
- svc-admin
- svc-identity
- svc-tokenomics

## Architecture
```
srv1117946 (Testnet Server)
├── fabric-testnet namespace
│   ├── Orderers (3)
│   ├── Peers (2)
│   ├── CouchDB (2)
│   └── Chaincode (gxtv3)
│
└── backend-testnet namespace
    ├── PostgreSQL (1 pod, 100Gi PVC)
    ├── Redis (1 pod, 20Gi PVC)
    ├── Workers
    │   ├── outbox-submitter (1 replica)
    │   └── projector (1 replica)
    └── APIs
        ├── svc-admin (1 replica)
        ├── svc-identity (1 replica)
        └── svc-tokenomics (1 replica)
```

## Frontend Integration Endpoints
After setup, frontend will connect to:
- API Gateway: http://api.testnet.gxcoin.local (or LoadBalancer IP)
- Services available:
  - POST /api/v1/admin/* (admin operations)
  - POST /api/v1/identity/* (user management)
  - POST /api/v1/tokenomics/* (transactions)

## Execution Steps
1. Complete image transfer
2. Update backend-testnet PVC nodeAffinity to srv1117946
3. Delete and recreate PostgreSQL/Redis on srv1117946
4. Update all deployments with nodeSelector for srv1117946
5. Scale up services and verify connectivity
6. Test bootstrap flow
7. Document API endpoints for frontend
