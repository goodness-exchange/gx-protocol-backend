import { db, Prisma } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { randomUUID, createHash } from 'crypto';
import type {
  CreateQSendRequestDTO,
  QSendRequestDTO,
  QSendDashboardDTO,
  QSendListQueryDTO,
  QSendStatus,
} from '../types/dtos';

/**
 * Q Send Service
 *
 * Handles QR-based payment request operations.
 * "Q" represents both "QR code" and "Qirat" (GX Coin unit).
 *
 * Features:
 * - Create payment requests with dynamic QR codes
 * - 5-minute validity (OTP-like) with auto-expiration
 * - Verify and pay requests via QR scan
 * - Dashboard with statistics and filters
 * - Receipt generation on payment completion
 */

// Constants
const DEFAULT_VALIDITY_SECONDS = 300; // 5 minutes
const MAX_VALIDITY_SECONDS = 600; // 10 minutes max
const MIN_VALIDITY_SECONDS = 60; // 1 minute min
const REQUEST_CODE_PREFIX = 'QS';

/**
 * Generate a unique request code (e.g., "QS-A1B2C3D4")
 */
function generateRequestCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes I, O, 0, 1 for clarity
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${REQUEST_CODE_PREFIX}-${code}`;
}

/**
 * Generate QR payload containing all request data
 */
function generateQRPayload(request: {
  requestCode: string;
  amount: number;
  description: string | null;
  reference: string | null;
  creatorFabricId: string;
  creatorName: string;
  expiresAt: Date;
}): string {
  const payload = {
    v: 1, // Version
    t: 'QSEND', // Type
    c: request.requestCode,
    a: request.amount,
    d: request.description || '',
    r: request.reference || '',
    f: request.creatorFabricId,
    n: request.creatorName,
    e: request.expiresAt.getTime(), // Expiry timestamp
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Parse QR payload back to structured data
 */
function parseQRPayload(qrData: string): {
  version: number;
  type: string;
  requestCode: string;
  amount: number;
  description: string;
  reference: string;
  creatorFabricId: string;
  creatorName: string;
  expiresAt: Date;
} | null {
  try {
    const decoded = Buffer.from(qrData, 'base64').toString('utf8');
    const payload = JSON.parse(decoded);

    if (payload.t !== 'QSEND' || !payload.c || !payload.a) {
      return null;
    }

    return {
      version: payload.v || 1,
      type: payload.t,
      requestCode: payload.c,
      amount: payload.a,
      description: payload.d || '',
      reference: payload.r || '',
      creatorFabricId: payload.f,
      creatorName: payload.n,
      expiresAt: new Date(payload.e),
    };
  } catch {
    return null;
  }
}

/**
 * Calculate remaining seconds until expiry
 */
function calculateRemainingSeconds(expiresAt: Date): number {
  const remaining = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  return Math.max(0, remaining);
}

class QSendService {
  /**
   * Create a new Q Send payment request
   */
  async createRequest(
    creatorProfileId: string,
    data: CreateQSendRequestDTO,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<QSendRequestDTO> {
    // Validate amount
    if (!data.amount || data.amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    // Get creator profile and wallet
    const creator = await db.userProfile.findUnique({
      where: { profileId: creatorProfileId },
      select: {
        profileId: true,
        firstName: true,
        lastName: true,
        fabricUserId: true,
        status: true,
        wallets: {
          where: { deletedAt: null },
          select: { walletId: true },
          take: 1,
        },
      },
    });

    if (!creator || !creator.fabricUserId) {
      throw new Error('Account not registered on blockchain');
    }

    if (creator.status !== 'ACTIVE') {
      throw new Error('Account is not active');
    }

    if (!creator.wallets.length) {
      throw new Error('No wallet found for this account');
    }

    // Calculate validity period
    let validitySeconds = data.validitySeconds || DEFAULT_VALIDITY_SECONDS;
    validitySeconds = Math.max(MIN_VALIDITY_SECONDS, Math.min(MAX_VALIDITY_SECONDS, validitySeconds));

    const now = new Date();
    const expiresAt = new Date(now.getTime() + validitySeconds * 1000);

    // Generate unique request code
    let requestCode = generateRequestCode();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await db.qSendRequest.findUnique({
        where: { requestCode },
      });
      if (!existing) break;
      requestCode = generateRequestCode();
      attempts++;
    }

    const creatorName = `${creator.firstName} ${creator.lastName}`.trim();

    // Generate QR payload
    const qrData = generateQRPayload({
      requestCode,
      amount: data.amount,
      description: data.description || null,
      reference: data.reference || null,
      creatorFabricId: creator.fabricUserId,
      creatorName,
      expiresAt,
    });

    // Generate hash for integrity verification
    const qrHash = createHash('sha256').update(qrData).digest('hex');

    // Create the request
    const request = await db.qSendRequest.create({
      data: {
        tenantId: 'default',
        requestCode,
        qrData,
        qrHash,
        creatorProfileId,
        creatorWalletId: creator.wallets[0].walletId,
        amount: data.amount,
        description: data.description || null,
        reference: data.reference || null,
        expiresAt,
        validitySeconds,
        status: 'ACTIVE',
        ipAddress: metadata?.ipAddress || null,
        userAgent: metadata?.userAgent || null,
      },
    });

    logger.info({
      requestCode,
      creatorProfileId,
      amount: data.amount,
      expiresAt,
    }, 'Q Send request created');

    return this.mapToDTO(request, creator);
  }

  /**
   * Get a Q Send request by request code
   */
  async getByRequestCode(requestCode: string): Promise<QSendRequestDTO | null> {
    const request = await db.qSendRequest.findUnique({
      where: { requestCode },
      include: {
        creator: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            fabricUserId: true,
          },
        },
        payer: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!request) return null;

    // Check and update expired status
    if (request.status === 'ACTIVE' && new Date() > request.expiresAt) {
      await db.qSendRequest.update({
        where: { id: request.id },
        data: {
          status: 'EXPIRED',
          statusChangedAt: new Date(),
        },
      });
      request.status = 'EXPIRED';
    }

    return this.mapToDTO(request, request.creator, request.payer);
  }

  /**
   * Verify QR data and return request details
   */
  async verifyQRData(qrData: string): Promise<{
    valid: boolean;
    request: QSendRequestDTO | null;
    error?: string;
  }> {
    // Parse QR payload
    const parsed = parseQRPayload(qrData);
    if (!parsed) {
      return { valid: false, request: null, error: 'Invalid QR code format' };
    }

    // Check expiry from QR data first (quick check)
    if (new Date() > parsed.expiresAt) {
      return { valid: false, request: null, error: 'Payment request has expired' };
    }

    // Get request from database
    const request = await this.getByRequestCode(parsed.requestCode);
    if (!request) {
      return { valid: false, request: null, error: 'Payment request not found' };
    }

    // Verify QR data matches
    const storedRequest = await db.qSendRequest.findUnique({
      where: { requestCode: parsed.requestCode },
    });

    if (storedRequest) {
      const expectedHash = createHash('sha256').update(qrData).digest('hex');
      if (storedRequest.qrHash !== expectedHash) {
        return { valid: false, request: null, error: 'QR code has been tampered with' };
      }

      // Update scan count
      await db.qSendRequest.update({
        where: { id: storedRequest.id },
        data: {
          scannedCount: { increment: 1 },
          lastScannedAt: new Date(),
        },
      });
    }

    // Check status
    if (request.status !== 'ACTIVE') {
      const statusMessages: Record<string, string> = {
        PAID: 'This request has already been paid',
        EXPIRED: 'This request has expired',
        CANCELLED: 'This request was cancelled',
      };
      return {
        valid: false,
        request,
        error: statusMessages[request.status] || 'Request is not active',
      };
    }

    return { valid: true, request };
  }

  /**
   * Process payment for a Q Send request
   */
  async pay(
    payerProfileId: string,
    requestCode: string
  ): Promise<{
    commandId: string;
    request: QSendRequestDTO;
  }> {
    // Get the request
    const storedRequest = await db.qSendRequest.findUnique({
      where: { requestCode },
      include: {
        creator: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            fabricUserId: true,
          },
        },
      },
    });

    if (!storedRequest) {
      throw new Error('Payment request not found');
    }

    // Check status
    if (storedRequest.status !== 'ACTIVE') {
      const statusMessages: Record<string, string> = {
        PAID: 'This request has already been paid',
        EXPIRED: 'This request has expired',
        CANCELLED: 'This request was cancelled',
      };
      throw new Error(statusMessages[storedRequest.status] || 'Request is not active');
    }

    // Check expiry
    if (new Date() > storedRequest.expiresAt) {
      await db.qSendRequest.update({
        where: { id: storedRequest.id },
        data: {
          status: 'EXPIRED',
          statusChangedAt: new Date(),
        },
      });
      throw new Error('Payment request has expired');
    }

    // Prevent self-payment
    if (payerProfileId === storedRequest.creatorProfileId) {
      throw new Error('Cannot pay your own request');
    }

    // Get payer profile
    const payer = await db.userProfile.findUnique({
      where: { profileId: payerProfileId },
      select: {
        profileId: true,
        firstName: true,
        lastName: true,
        fabricUserId: true,
        status: true,
        wallets: {
          where: { deletedAt: null },
          select: { walletId: true, cachedBalance: true },
          take: 1,
        },
      },
    });

    if (!payer || !payer.fabricUserId) {
      throw new Error('Payer account not registered on blockchain');
    }

    if (payer.status !== 'ACTIVE') {
      throw new Error('Payer account is not active');
    }

    if (!payer.wallets.length) {
      throw new Error('No wallet found for payer account');
    }

    // Check balance
    const balance = Number(payer.wallets[0].cachedBalance);
    const amount = Number(storedRequest.amount);
    if (balance < amount) {
      throw new Error(`Insufficient balance. Required: ${amount}, Available: ${balance}`);
    }

    // Create OutboxCommand for the transfer
    const commandId = randomUUID();
    const remark = storedRequest.description
      ? `Q Send: ${storedRequest.description}`
      : `Q Send payment ${requestCode}`;

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create the outbox command
      await tx.outboxCommand.create({
        data: {
          id: commandId,
          tenantId: 'default',
          service: 'svc-identity',
          commandType: 'Q_SEND_PAY',
          requestId: `qsend-${commandId}`,
          payload: {
            fromUserId: payer.fabricUserId,
            toUserId: storedRequest.creator.fabricUserId,
            amount: Math.floor(amount),
            remark,
            qsendRequestId: storedRequest.id,
            qsendRequestCode: requestCode,
          },
          status: 'PENDING',
          attempts: 0,
        },
      });

      // Update the Q Send request
      await tx.qSendRequest.update({
        where: { id: storedRequest.id },
        data: {
          status: 'PAID',
          statusChangedAt: new Date(),
          payerProfileId,
          payerWalletId: payer.wallets[0].walletId,
          paidAt: new Date(),
          outboxCommandId: commandId,
        },
      });
    });

    logger.info({
      commandId,
      requestCode,
      payerProfileId,
      creatorProfileId: storedRequest.creatorProfileId,
      amount,
    }, 'Q Send payment initiated');

    // Get updated request
    const updatedRequest = await this.getByRequestCode(requestCode);
    if (!updatedRequest) {
      throw new Error('Failed to retrieve updated request');
    }

    return { commandId, request: updatedRequest };
  }

  /**
   * Cancel a Q Send request (by creator only)
   */
  async cancel(creatorProfileId: string, requestCode: string): Promise<QSendRequestDTO> {
    const request = await db.qSendRequest.findUnique({
      where: { requestCode },
      include: {
        creator: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            fabricUserId: true,
          },
        },
      },
    });

    if (!request) {
      throw new Error('Payment request not found');
    }

    if (request.creatorProfileId !== creatorProfileId) {
      throw new Error('Only the creator can cancel this request');
    }

    if (request.status !== 'ACTIVE') {
      throw new Error('Only active requests can be cancelled');
    }

    const updated = await db.qSendRequest.update({
      where: { id: request.id },
      data: {
        status: 'CANCELLED',
        statusChangedAt: new Date(),
      },
      include: {
        creator: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            fabricUserId: true,
          },
        },
      },
    });

    logger.info({
      requestCode,
      creatorProfileId,
    }, 'Q Send request cancelled');

    return this.mapToDTO(updated, updated.creator);
  }

  /**
   * Get Q Send requests for a user with filters
   */
  async listRequests(
    profileId: string,
    query: QSendListQueryDTO,
    role: 'creator' | 'payer' | 'all' = 'creator'
  ): Promise<QSendRequestDTO[]> {
    const where: any = {
      tenantId: 'default',
    };

    // Filter by role
    if (role === 'creator') {
      where.creatorProfileId = profileId;
    } else if (role === 'payer') {
      where.payerProfileId = profileId;
    } else {
      where.OR = [
        { creatorProfileId: profileId },
        { payerProfileId: profileId },
      ];
    }

    // Filter by status
    if (query.status) {
      where.status = query.status;
    }

    // Filter by date range
    if (query.startDate) {
      where.createdAt = { gte: new Date(query.startDate) };
    }
    if (query.endDate) {
      where.createdAt = {
        ...where.createdAt,
        lte: new Date(query.endDate),
      };
    }

    const requests = await db.qSendRequest.findMany({
      where,
      include: {
        creator: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            fabricUserId: true,
          },
        },
        payer: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit || 50,
      skip: query.offset || 0,
    });

    // Update expired statuses
    const now = new Date();
    for (const request of requests) {
      if (request.status === 'ACTIVE' && now > request.expiresAt) {
        await db.qSendRequest.update({
          where: { id: request.id },
          data: {
            status: 'EXPIRED',
            statusChangedAt: now,
          },
        });
        request.status = 'EXPIRED';
      }
    }

    return requests.map((r: any) => this.mapToDTO(r, r.creator, r.payer));
  }

  /**
   * Get dashboard statistics for a user
   */
  async getDashboard(profileId: string): Promise<QSendDashboardDTO> {
    // First, expire any active requests that have passed their expiry time
    await db.qSendRequest.updateMany({
      where: {
        creatorProfileId: profileId,
        status: 'ACTIVE',
        expiresAt: { lt: new Date() },
      },
      data: {
        status: 'EXPIRED',
        statusChangedAt: new Date(),
      },
    });

    // Get counts by status
    const [activeCount, paidCount, expiredCount, cancelledCount] = await Promise.all([
      db.qSendRequest.count({
        where: { creatorProfileId: profileId, status: 'ACTIVE' },
      }),
      db.qSendRequest.count({
        where: { creatorProfileId: profileId, status: 'PAID' },
      }),
      db.qSendRequest.count({
        where: { creatorProfileId: profileId, status: 'EXPIRED' },
      }),
      db.qSendRequest.count({
        where: { creatorProfileId: profileId, status: 'CANCELLED' },
      }),
    ]);

    const totalRequests = activeCount + paidCount + expiredCount + cancelledCount;

    // Get total amounts
    const [requestedSum, receivedSum] = await Promise.all([
      db.qSendRequest.aggregate({
        where: { creatorProfileId: profileId },
        _sum: { amount: true },
      }),
      db.qSendRequest.aggregate({
        where: { creatorProfileId: profileId, status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    // Get recent requests
    const recentRequests = await this.listRequests(
      profileId,
      { limit: 10 },
      'creator'
    );

    return {
      stats: {
        totalRequests,
        activeRequests: activeCount,
        paidRequests: paidCount,
        expiredRequests: expiredCount,
        cancelledRequests: cancelledCount,
        totalAmountRequested: Number(requestedSum._sum.amount || 0),
        totalAmountReceived: Number(receivedSum._sum.amount || 0),
      },
      recentRequests,
    };
  }

  /**
   * Map database record to DTO
   */
  private mapToDTO(
    request: any,
    creator: any,
    payer?: any | null
  ): QSendRequestDTO {
    const creatorName = creator
      ? `${creator.firstName} ${creator.lastName}`.trim()
      : 'Unknown';
    const payerName = payer
      ? `${payer.firstName} ${payer.lastName}`.trim()
      : null;

    return {
      id: request.id,
      requestCode: request.requestCode,
      qrData: request.qrData,
      amount: Number(request.amount),
      description: request.description,
      reference: request.reference,
      status: request.status as QSendStatus,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      validitySeconds: request.validitySeconds,
      remainingSeconds: calculateRemainingSeconds(request.expiresAt),
      creatorProfileId: request.creatorProfileId,
      creatorName,
      creatorFabricId: creator?.fabricUserId || '',
      payerProfileId: request.payerProfileId,
      payerName,
      paidAt: request.paidAt,
      onChainTxId: request.onChainTxId,
    };
  }
}

export const qsendService = new QSendService();
