# Work Record - December 3, 2025 (Session 3)

## Session Overview
**Date**: December 3, 2025
**Session**: 3 (Document Storage Implementation)
**Focus**: Implementing Google Drive document storage with ClamAV virus scanning

---

## Work Completed

### 1. Core Storage Package (`packages/core-storage`)

Created a new shared package providing document storage abstraction.

#### Files Created:

| File | Purpose |
|------|---------|
| `packages/core-storage/package.json` | Package configuration with googleapis and clamscan dependencies |
| `packages/core-storage/tsconfig.json` | TypeScript configuration |
| `packages/core-storage/src/types.ts` | TypeScript interfaces and enums |
| `packages/core-storage/src/virus-scanner.ts` | ClamAV integration for virus scanning |
| `packages/core-storage/src/google-drive.provider.ts` | Google Drive API storage provider |
| `packages/core-storage/src/storage.service.ts` | Combined storage service with virus scanning |
| `packages/core-storage/src/index.ts` | Package exports |
| `packages/core-storage/src/clamscan.d.ts` | Type declarations for clamscan module |

#### Key Interfaces:

```typescript
interface StorageProvider {
  upload(file: Buffer, path: string, metadata: FileMetadata): Promise<StorageResult>;
  download(fileId: string): Promise<Buffer>;
  getSignedUrl(fileId: string, options?: SignedUrlOptions): Promise<string>;
  delete(fileId: string): Promise<void>;
  listFiles(folderPath: string): Promise<FileInfo[]>;
  createFolder(path: string): Promise<string>;
  exists(fileId: string): Promise<boolean>;
}

interface VirusScanner {
  scan(file: Buffer): Promise<VirusScanResult>;
  isHealthy(): Promise<boolean>;
}
```

#### Helper Functions:

```typescript
buildUserDocumentPath(profileId, category)  // users/{profileId}/kyc|proof_of_address|selfie
buildOrganizationDocumentPath(orgId, category)  // organizations/{orgId}/registration|tax
buildRelationshipDocumentPath(relationshipId)  // relationships/{id}/status_documents
```

---

### 2. Document Upload Endpoints in svc-identity

Added multipart file upload support to svc-identity service.

#### Dependencies Added:
- `@gx/core-storage`: Document storage abstraction
- `multer`: Multipart form-data handling
- `@types/multer`: TypeScript definitions

#### Files Created:

| File | Purpose |
|------|---------|
| `apps/svc-identity/src/services/documents.service.ts` | Document upload business logic |
| `apps/svc-identity/src/controllers/documents.controller.ts` | HTTP request handlers |
| `apps/svc-identity/src/routes/documents.routes.ts` | Express route definitions |

#### New API Endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/users/:id/documents/upload` | POST | Upload a document (multipart) |
| `/api/v1/users/:id/documents` | GET | List user's documents |
| `/api/v1/documents/:documentId/url` | GET | Get signed access URL (admin) |
| `/api/v1/documents/:documentId` | DELETE | Delete a document (admin) |
| `/api/v1/documents/health` | GET | Storage service health check |
| `/api/v1/documents/constraints` | GET | Get upload constraints |

#### Upload Request Format:
```
POST /api/v1/users/:id/documents/upload
Content-Type: multipart/form-data

Fields:
- file: Binary file data (max 10MB)
- documentType: NATIONAL_ID | PASSPORT | PROOF_OF_ADDRESS | ...
- side: FRONT | BACK (optional)
- metadata: JSON string with documentNumber, issuingCountry, etc.
```

---

### 3. ClamAV Kubernetes Deployment

Created Kubernetes manifests for deploying ClamAV antivirus scanner.

#### Files Created:

| File | Purpose |
|------|---------|
| `k8s/infrastructure/clamav/deployment.yaml` | Deployment, Service, PVC, ConfigMap |

#### ClamAV Configuration:
- Port: 3310 (clamd protocol)
- Max file size: 10MB
- Database persistence: 5Gi PVC
- Resource limits: 500m CPU, 2Gi RAM

---

### 4. Google Drive Credentials Template

Created Kubernetes secret template for Google Drive credentials.

#### Files Created:

| File | Purpose |
|------|---------|
| `k8s/infrastructure/secrets/google-drive-secret.yaml.template` | Secret template with instructions |

#### Required Environment Variables:
```bash
GOOGLE_SERVICE_ACCOUNT_KEY=<base64 encoded JSON key>
GOOGLE_DRIVE_ROOT_FOLDER_ID=<folder ID>
CLAMAV_HOST=clamav.backend-mainnet.svc.cluster.local
CLAMAV_PORT=3310
```

---

## Files Created

### New Packages
| File | Lines |
|------|-------|
| `packages/core-storage/package.json` | 21 |
| `packages/core-storage/tsconfig.json` | 9 |
| `packages/core-storage/src/types.ts` | 180 |
| `packages/core-storage/src/virus-scanner.ts` | 130 |
| `packages/core-storage/src/google-drive.provider.ts` | 250 |
| `packages/core-storage/src/storage.service.ts` | 120 |
| `packages/core-storage/src/index.ts` | 75 |
| `packages/core-storage/src/clamscan.d.ts` | 45 |

### Service Additions
| File | Lines |
|------|-------|
| `apps/svc-identity/src/services/documents.service.ts` | 345 |
| `apps/svc-identity/src/controllers/documents.controller.ts` | 350 |
| `apps/svc-identity/src/routes/documents.routes.ts` | 110 |

### Kubernetes Manifests
| File | Purpose |
|------|---------|
| `k8s/infrastructure/clamav/deployment.yaml` | ClamAV antivirus deployment |
| `k8s/infrastructure/secrets/google-drive-secret.yaml.template` | Credentials template |

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/svc-identity/package.json` | Added multer, @gx/core-storage dependencies |
| `apps/svc-identity/src/app.ts` | Mounted documents routes |

---

## Technical Decisions

### 1. Lazy Initialization for Storage Service
Storage service is lazily initialized to avoid connection errors when credentials are not available:
```typescript
let storageService: DocumentStorageService | null = null;

function getStorageService(): DocumentStorageService {
  if (!storageService) {
    storageService = createStorageService();
  }
  return storageService;
}
```

### 2. File Hash Computation
SHA-256 hash is computed server-side for verification:
```typescript
function computeHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
```

### 3. Virus Scanning Bypass Option
Development environments can bypass virus scanning:
```typescript
if (this.config.bypassScan) {
  return { isClean: true, message: 'Scan bypassed (development mode)' };
}
```

---

## Pending Tasks

### GCP Setup (Manual)
1. [ ] Create GCP project `gx-protocol-storage`
2. [ ] Enable Google Drive API
3. [ ] Create service account `gx-drive-uploader`
4. [ ] Download JSON key file
5. [ ] Share Drive folder with service account email
6. [ ] Copy folder ID from Drive URL

### Kubernetes Deployment
1. [ ] Deploy ClamAV: `kubectl apply -f k8s/infrastructure/clamav/deployment.yaml`
2. [ ] Create Google Drive secret from template
3. [ ] Update svc-identity deployment with new environment variables
4. [ ] Build and push updated svc-identity image

### Frontend Integration
1. [ ] Update KYRWizard to upload files to backend
2. [ ] Handle upload progress indication
3. [ ] Display upload errors properly

---

## Session Statistics

| Metric | Value |
|--------|-------|
| Duration | ~2 hours |
| New Package | 1 (core-storage) |
| New Service Files | 3 |
| New K8s Manifests | 2 |
| Total New Files | 13 |
| Total Modified Files | 2 |
| Lines of Code Added | ~1,600 |

---

---

## Continuation Work (December 7-8, 2025)

### Session 4: Deployment and Module Resolution Fixes

#### Google Drive Credentials Configured
- User provided service account: `gx-drive-uploader@gx-protocol-storage.iam.gserviceaccount.com`
- Root folder ID: `11Y79OCvjzgYbEiiPArXsS6UoXKGA5l8A`
- Created Kubernetes secret `google-drive-credentials` in `backend-mainnet` namespace

#### Dockerfile Refactoring for Monorepo Compatibility

**Problem**: npm workspace symlinks in `node_modules/@gx/` were not resolving correctly when:
1. Container uses `readOnlyRootFilesystem: true`
2. Container runs as different UID than image's USER directive

**Root Cause Analysis**:
- Image built with USER 1001 (gxprotocol)
- Deployment had `runAsUser: 1000`
- Combined with `readOnlyRootFilesystem: true`, caused module resolution failures

**Solution Applied**:
1. Replace symlinks with actual directories in `node_modules/@gx/`
2. Copy full package directories (package.json + dist) from builder
3. Updated deployment to use `runAsUser: 1001`

**Dockerfile Changes**:
```dockerfile
# Replace workspace symlinks with actual directories
RUN rm -rf /app/node_modules/@gx && mkdir -p /app/node_modules/@gx && \
    cp -r /app/packages/core-config /app/node_modules/@gx/ && \
    cp -r /app/packages/core-db /app/node_modules/@gx/ && \
    cp -r /app/packages/core-logger /app/node_modules/@gx/ && \
    cp -r /app/packages/core-http /app/node_modules/@gx/ && \
    cp -r /app/packages/core-events /app/node_modules/@gx/ && \
    cp -r /app/packages/core-openapi /app/node_modules/@gx/ && \
    cp -r /app/packages/core-fabric /app/node_modules/@gx/ && \
    cp -r /app/packages/core-storage /app/node_modules/@gx/
```

#### Deployment Fixes
- Fixed `runAsUser` from 1000 to 1001 to match image's gxprotocol user
- Added environment variables:
  - `GOOGLE_DRIVE_ROOT_FOLDER_ID`
  - `GOOGLE_SERVICE_ACCOUNT_KEY` (from secret)
  - `CLAMAV_BYPASS=true` (ClamAV not deployed yet)

#### Build Versions
- v2.0.26 - v2.0.31: Various failed attempts with symlink issues
- v2.0.32: **Successfully deployed** with directory-based module resolution

#### Final Deployment Status
```
NAME                            READY   STATUS    RESTARTS   AGE
svc-identity-5c4b65b648-d6vwf   1/1     Running   0          50s
svc-identity-5c4b65b648-f4f9k   1/1     Running   0          35s
svc-identity-5c4b65b648-n88z7   1/1     Running   0          20s
```

All 3 pods running healthy across all cluster nodes (Malaysia, USA, Germany).

#### Commits Made
1. `fix(core-storage): configure TypeScript to include custom type declarations`
2. `refactor(svc-identity): improve Dockerfile for npm workspace monorepo compatibility`

---

## Completed Tasks (Updated)

- [x] Create GCP project and service account
- [x] Share Google Drive folder with service account
- [x] Create and apply Google Drive credentials secret
- [x] Fix Dockerfile for monorepo workspace compatibility
- [x] Fix deployment user ID mismatch
- [x] Build and deploy updated svc-identity (v2.0.32)
- [ ] Deploy ClamAV to Kubernetes cluster (network restrictions)
- [ ] Update frontend KYRWizard for actual uploads
- [ ] End-to-end testing
