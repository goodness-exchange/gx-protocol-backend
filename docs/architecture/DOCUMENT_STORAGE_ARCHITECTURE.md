# Document Storage Architecture

## Overview

This document describes the architecture for storing and managing user documents (KYC/KYR documents, business documents, proof of address, etc.) in the GX Protocol system using Google Drive as the storage backend.

## Architecture Decision Record

### Decision: Use Google Drive API for Document Storage

**Date**: December 3, 2025

**Status**: Approved

**Context**: The GX Protocol system requires secure document storage for:
- KYC/KYR verification documents (National ID, Passport, Selfies)
- Proof of address documents (Utility bills, Bank statements)
- Business/Organization documents (Registration, Tax certificates)
- Family relationship documents (Death certificates, Divorce papers)

**Decision**: Use Google Drive API with a service account connected to an existing 2TB personal Google Drive account.

**Rationale**:
| Consideration | Google Drive | Self-Hosted (MinIO/S3) |
|---------------|--------------|------------------------|
| Cost | Free (existing 2TB) | Server costs + storage |
| Setup Complexity | Low | High |
| Redundancy | Google's infrastructure | Manual replication |
| Admin Access | Familiar UI | Custom dashboard needed |
| Security | Google's security + encryption | Self-managed |
| Rate Limits | 12,000 req/100s | Unlimited |
| Max File Size | 5TB (resumable) | Unlimited |

**Consequences**:
- Dependent on Google's service availability
- Need to manage API rate limits
- Service account credentials must be secured

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         KYRWizard Component                          │    │
│  │  - Select files (National ID, Passport, etc.)                       │    │
│  │  - Compute SHA-256 hash client-side                                 │    │
│  │  - Upload to BFF endpoint                                           │    │
│  │  - Submit KYC with file references                                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BFF LAYER (Next.js API Routes)                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  POST /api/users/:id/documents/upload                               │    │
│  │  - Proxy multipart upload to svc-identity                           │    │
│  │  - Forward auth token                                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (svc-identity)                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Document Upload Service                                            │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │    │
│  │  │   Multer    │→ │  ClamAV     │→ │  Storage    │                 │    │
│  │  │  (Parse)    │  │  (Scan)     │  │  Provider   │                 │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
┌───────────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│     ClamAV Pod        │  │   PostgreSQL    │  │  Google Drive   │
│  ┌─────────────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │
│  │ Virus Scanner   │  │  │  │KYCDocument│  │  │  │  Files    │  │
│  │ Port: 3310      │  │  │  │  Table    │  │  │  │  Storage  │  │
│  └─────────────────┘  │  │  └───────────┘  │  │  └───────────┘  │
└───────────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Component Details

### 1. Core Storage Package (`packages/core-storage`)

A shared package providing an abstraction layer for file storage operations.

```typescript
// Storage Provider Interface
interface StorageProvider {
  /**
   * Upload a file to storage
   */
  upload(
    file: Buffer,
    path: string,
    metadata: FileMetadata
  ): Promise<StorageResult>;

  /**
   * Download a file from storage
   */
  download(fileId: string): Promise<Buffer>;

  /**
   * Generate a time-limited access URL
   */
  getSignedUrl(fileId: string, expiresInMinutes: number): Promise<string>;

  /**
   * Delete a file from storage
   */
  delete(fileId: string): Promise<void>;

  /**
   * List files in a folder
   */
  listFiles(folderPath: string): Promise<FileInfo[]>;

  /**
   * Create a folder
   */
  createFolder(path: string): Promise<string>;
}
```

### 2. Google Drive Provider

Implementation of `StorageProvider` using the Google Drive API.

**Authentication**: Service account with JSON key credentials

**Folder Structure**:
```
GX-Protocol-Documents/           (Root - shared with service account)
├── users/
│   └── {profileId}/
│       ├── kyc/
│       │   ├── national_id_front_{timestamp}.{ext}
│       │   ├── national_id_back_{timestamp}.{ext}
│       │   ├── passport_{timestamp}.{ext}
│       │   └── selfie_{timestamp}.{ext}
│       └── proof_of_address/
│           └── document_{timestamp}.{ext}
├── organizations/
│   └── {organizationId}/
│       ├── registration/
│       └── tax/
└── relationships/
    └── {relationshipId}/
        └── status_documents/
```

### 3. Virus Scanner (ClamAV)

All uploaded files are scanned for malware before storage.

**Deployment**: Kubernetes pod in `backend-mainnet` namespace
**Port**: 3310 (clamd protocol)
**Image**: `clamav/clamav:latest`

**Scan Flow**:
1. File received by upload endpoint
2. File sent to ClamAV for scanning
3. If clean → proceed to Google Drive upload
4. If infected → reject with error, log incident

### 4. Document Upload Endpoint

**Endpoint**: `POST /api/v1/users/:id/documents/upload`

**Request**:
```
Content-Type: multipart/form-data

Fields:
- file: Binary file data (max 10MB)
- documentType: NATIONAL_ID | PASSPORT | PROOF_OF_ADDRESS | SELFIE | OTHER
- side: FRONT | BACK (optional, for ID cards)
- metadata: JSON string with additional info
```

**Response**:
```json
{
  "success": true,
  "data": {
    "fileId": "1ABC123xyz",
    "fileName": "national_id_front_1701619200000.jpg",
    "storageUrl": "gdrive://1ABC123xyz",
    "hash": "sha256:abc123...",
    "size": 524288,
    "mimeType": "image/jpeg",
    "virusScanStatus": "clean",
    "uploadedAt": "2025-12-03T12:00:00Z"
  }
}
```

---

## Security Model

### Authentication & Authorization
- All uploads require valid JWT token
- Users can only upload to their own profile folder
- Admins can view/download documents for users they are reviewing

### File Validation
| Check | Implementation |
|-------|---------------|
| File size | Max 10MB per file |
| MIME type | Whitelist: image/jpeg, image/png, application/pdf |
| Virus scan | ClamAV real-time scanning |
| Hash verification | SHA-256 computed and stored |

### Access Control
- **Service Account**: Editor access to root folder only
- **Signed URLs**: Time-limited (15 minutes) for admin viewing
- **User Isolation**: Each user's files in separate subfolder
- **Audit Logging**: All upload/access events logged

### Data Protection
- Files encrypted at rest by Google Drive
- HTTPS for all transfers
- Optional client-side encryption (future enhancement)

---

## Database Schema

### KYCDocument Table
```prisma
model KYCDocument {
  documentId        String    @id @default(uuid())
  kycId             String
  documentType      DocumentType
  side              String?   // FRONT, BACK

  // Storage
  storageUrl        String    // gdrive://{fileId}
  fileHash          String    // SHA-256
  fileSize          Int
  mimeType          String

  // Document details
  documentNumber    String?
  issuingCountry    String?   @db.Char(2)
  issuedDate        DateTime?
  expiryDate        DateTime?

  // Security
  encryptionKey     String?   // For E2E encryption (future)
  virusScanStatus   String    // clean, infected, pending
  virusScanDate     DateTime?

  // Versioning
  version           Int       @default(1)
  replacesDocumentId String?

  // Timestamps
  uploadedAt        DateTime  @default(now())
  verifiedAt        DateTime?
  verifiedBy        String?

  // Relations
  kyc               KYCVerification @relation(fields: [kycId], references: [kycId])
}

enum DocumentType {
  NATIONAL_ID
  PASSPORT
  DRIVERS_LICENSE
  PROOF_OF_ADDRESS
  DEATH_CERTIFICATE
  DIVORCE_CERTIFICATE
  BUSINESS_REGISTRATION
  TAX_REGISTRATION
  BANK_STATEMENT
  UTILITY_BILL
  SELFIE_PHOTO
  OTHER
}
```

---

## Configuration

### Environment Variables

```bash
# Google Drive Configuration
GOOGLE_SERVICE_ACCOUNT_KEY=<base64 encoded JSON key>
GOOGLE_DRIVE_ROOT_FOLDER_ID=<folder ID>

# ClamAV Configuration
CLAMAV_HOST=clamav.backend-mainnet.svc.cluster.local
CLAMAV_PORT=3310

# Upload Limits
MAX_FILE_SIZE_MB=10
ALLOWED_MIME_TYPES=image/jpeg,image/png,application/pdf

# Signed URL Configuration
SIGNED_URL_EXPIRY_MINUTES=15
```

### Kubernetes Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: google-drive-credentials
  namespace: backend-mainnet
type: Opaque
data:
  credentials.json: <base64 encoded service account JSON>
```

---

## Upload Flow Sequence

```
User                    Frontend           BFF              svc-identity        ClamAV         Google Drive
  │                        │                │                    │                │                │
  │  Select files          │                │                    │                │                │
  │───────────────────────>│                │                    │                │                │
  │                        │                │                    │                │                │
  │                        │ Compute hash   │                    │                │                │
  │                        │ (SHA-256)      │                    │                │                │
  │                        │                │                    │                │                │
  │                        │ POST /upload   │                    │                │                │
  │                        │───────────────>│                    │                │                │
  │                        │                │                    │                │                │
  │                        │                │ Forward multipart  │                │                │
  │                        │                │───────────────────>│                │                │
  │                        │                │                    │                │                │
  │                        │                │                    │ Scan file      │                │
  │                        │                │                    │───────────────>│                │
  │                        │                │                    │                │                │
  │                        │                │                    │<───────────────│                │
  │                        │                │                    │ Clean/Infected │                │
  │                        │                │                    │                │                │
  │                        │                │                    │ Upload file    │                │
  │                        │                │                    │───────────────────────────────>│
  │                        │                │                    │                │                │
  │                        │                │                    │<───────────────────────────────│
  │                        │                │                    │ File ID        │                │
  │                        │                │                    │                │                │
  │                        │                │                    │ Save to DB     │                │
  │                        │                │                    │ (KYCDocument)  │                │
  │                        │                │                    │                │                │
  │                        │                │<───────────────────│                │                │
  │                        │                │ Response           │                │                │
  │                        │<───────────────│                    │                │                │
  │                        │ Response       │                    │                │                │
  │<───────────────────────│                │                    │                │                │
  │ Upload complete        │                │                    │                │                │
```

---

## Admin Document Access Flow

```
Admin                   Admin Dashboard        svc-admin          svc-identity      Google Drive
  │                          │                    │                    │                │
  │  View user KYC           │                    │                    │                │
  │─────────────────────────>│                    │                    │                │
  │                          │                    │                    │                │
  │                          │ GET /admin/users/:id/kyc               │                │
  │                          │───────────────────>│                    │                │
  │                          │                    │                    │                │
  │                          │                    │ Get documents      │                │
  │                          │                    │───────────────────>│                │
  │                          │                    │                    │                │
  │                          │                    │ Generate signed URLs               │
  │                          │                    │                    │───────────────>│
  │                          │                    │                    │                │
  │                          │                    │                    │<───────────────│
  │                          │                    │                    │ Signed URLs    │
  │                          │                    │<───────────────────│                │
  │                          │                    │ Documents + URLs   │                │
  │                          │<───────────────────│                    │                │
  │                          │ Response           │                    │                │
  │<─────────────────────────│                    │                    │                │
  │ View documents           │                    │                    │                │
  │ (15 min access)          │                    │                    │                │
```

---

## Error Handling

| Error | HTTP Code | Action |
|-------|-----------|--------|
| File too large | 413 | Reject immediately |
| Invalid MIME type | 400 | Reject with allowed types |
| Virus detected | 422 | Reject, log incident, alert admin |
| ClamAV unavailable | 503 | Queue for later scan or reject |
| Google Drive error | 502 | Retry with exponential backoff |
| Rate limit exceeded | 429 | Queue or retry after delay |

---

## Monitoring & Alerting

### Metrics to Track
- Upload success/failure rate
- Average upload latency
- Virus detection rate
- Google Drive API quota usage
- ClamAV scan queue depth

### Alerts
- Virus detected → Immediate notification
- Google Drive quota > 80% → Warning
- ClamAV pod unhealthy → Critical
- Upload failure rate > 5% → Warning

---

## Future Enhancements

1. **Client-side encryption**: Encrypt files before upload, decrypt on admin view
2. **Document OCR**: Extract text from ID documents for auto-fill
3. **Face matching**: Compare selfie with ID photo
4. **Document expiry alerts**: Notify users before documents expire
5. **Bulk document export**: Admin feature for compliance audits

---

## References

- [Google Drive API Documentation](https://developers.google.com/drive/api/v3/reference)
- [ClamAV Documentation](https://docs.clamav.net/)
- [Prisma Schema Reference](../../../db/prisma/schema.prisma)
- [KYRWizard Component](../../../gx-wallet-frontend/components/kyr/KYRWizard.tsx)
