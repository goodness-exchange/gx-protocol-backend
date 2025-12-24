import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  DecryptionRequestDTO,
  DecryptionAuditDTO,
  DecryptedMessageDTO,
} from '../types/dtos';

interface ListRequestsOptions {
  status?: string;
  limit: number;
  offset: number;
}

interface AuditLogOptions {
  limit: number;
  offset: number;
  startDate?: string;
  endDate?: string;
}

class ComplianceService {
  /**
   * Create a decryption request
   */
  async createDecryptionRequest(
    requestedByAdminId: string,
    dto: DecryptionRequestDTO
  ): Promise<DecryptionAuditDTO> {
    logger.info(
      { requestedByAdminId, reason: dto.reason, targetType: dto.targetType },
      'Creating decryption request'
    );

    // Get active master key
    const masterKey = await db.masterKey.findFirst({
      where: { isActive: true },
    });

    if (!masterKey) {
      throw new Error('No active master key found');
    }

    // Create request hash for integrity
    const requestData = JSON.stringify({
      requestedByAdminId,
      ...dto,
      timestamp: new Date().toISOString(),
    });
    const requestHash = crypto.createHash('sha256').update(requestData).digest('hex');

    // Get previous audit hash for chain integrity
    const previousAudit = await db.masterKeyDecryptionAudit.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const audit = await db.masterKeyDecryptionAudit.create({
      data: {
        auditId: uuidv4(),
        tenantId: 'default',
        masterKeyId: masterKey.keyId,
        requestedByAdminId,
        targetMessageId: dto.targetMessageId,
        targetConversationId: dto.targetConversationId,
        targetProfileId: dto.targetProfileId,
        dateRangeStart: dto.dateRangeStart ? new Date(dto.dateRangeStart) : null,
        dateRangeEnd: dto.dateRangeEnd ? new Date(dto.dateRangeEnd) : null,
        reason: dto.reason,
        caseNumber: dto.caseNumber,
        courtOrderNumber: dto.courtOrderNumber,
        justification: dto.justification,
        requestHash,
        previousAuditHash: previousAudit?.requestHash || null,
      },
    });

    return this.auditToDTO(audit);
  }

  /**
   * List decryption requests
   */
  async listRequests(options: ListRequestsOptions): Promise<{
    requests: DecryptionAuditDTO[];
    pagination: { limit: number; offset: number; hasMore: boolean };
  }> {
    const where: any = {};

    if (options.status === 'PENDING') {
      where.approvedAt = null;
      where.rejectedAt = null;
    } else if (options.status === 'APPROVED') {
      where.approvedAt = { not: null };
      where.rejectedAt = null;
    } else if (options.status === 'REJECTED') {
      where.rejectedAt = { not: null };
    } else if (options.status === 'EXECUTED') {
      where.executedAt = { not: null };
    }

    const [audits, total] = await Promise.all([
      db.masterKeyDecryptionAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit,
        skip: options.offset,
      }),
      db.masterKeyDecryptionAudit.count({ where }),
    ]);

    return {
      requests: audits.map((a: any) => this.auditToDTO(a)),
      pagination: {
        limit: options.limit,
        offset: options.offset,
        hasMore: options.offset + audits.length < total,
      },
    };
  }

  /**
   * Get specific decryption request
   */
  async getRequest(requestId: string): Promise<DecryptionAuditDTO | null> {
    const audit = await db.masterKeyDecryptionAudit.findUnique({
      where: { auditId: requestId },
    });

    return audit ? this.auditToDTO(audit) : null;
  }

  /**
   * Approve decryption request (requires second SUPER_OWNER)
   */
  async approveRequest(requestId: string, approvedByAdminId: string): Promise<DecryptionAuditDTO> {
    const audit = await db.masterKeyDecryptionAudit.findUnique({
      where: { auditId: requestId },
    });

    if (!audit) {
      throw new Error('Request not found');
    }

    if (audit.approvedAt) {
      throw new Error('Request already approved');
    }

    if (audit.rejectedAt) {
      throw new Error('Request was rejected');
    }

    // Cannot approve own request
    if (audit.requestedByAdminId === approvedByAdminId) {
      throw new Error('Cannot approve own request');
    }

    const updated = await db.masterKeyDecryptionAudit.update({
      where: { auditId: requestId },
      data: {
        approvedByAdminId,
        approvedAt: new Date(),
      },
    });

    logger.info({ requestId, approvedByAdminId }, 'Decryption request approved');

    return this.auditToDTO(updated);
  }

  /**
   * Reject decryption request
   */
  async rejectRequest(
    requestId: string,
    rejectedByAdminId: string,
    reason: string
  ): Promise<DecryptionAuditDTO> {
    const audit = await db.masterKeyDecryptionAudit.findUnique({
      where: { auditId: requestId },
    });

    if (!audit) {
      throw new Error('Request not found');
    }

    if (audit.approvedAt || audit.rejectedAt) {
      throw new Error('Request already processed');
    }

    const updated = await db.masterKeyDecryptionAudit.update({
      where: { auditId: requestId },
      data: {
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });

    logger.info({ requestId, rejectedByAdminId }, 'Decryption request rejected');

    return this.auditToDTO(updated);
  }

  /**
   * Execute approved decryption
   */
  async executeDecryption(
    requestId: string,
    executedByAdminId: string
  ): Promise<{ messagesDecrypted: number; messages: DecryptedMessageDTO[] }> {
    const audit = await db.masterKeyDecryptionAudit.findUnique({
      where: { auditId: requestId },
    });

    if (!audit) {
      throw new Error('Request not found');
    }

    if (!audit.approvedAt) {
      throw new Error('Request not approved');
    }

    if (audit.executedAt) {
      throw new Error('Request already executed');
    }

    // Build query based on target type
    const where: any = {};

    if (audit.targetMessageId) {
      where.messageId = audit.targetMessageId;
    } else if (audit.targetConversationId) {
      where.conversationId = audit.targetConversationId;
    } else if (audit.targetProfileId) {
      where.senderProfileId = audit.targetProfileId;
    }

    if (audit.dateRangeStart) {
      where.createdAt = { gte: audit.dateRangeStart };
    }
    if (audit.dateRangeEnd) {
      where.createdAt = { ...where.createdAt, lte: audit.dateRangeEnd };
    }

    // Fetch messages
    const messages = await db.message.findMany({
      where,
      include: {
        conversation: true,
      },
      take: 1000, // Limit for safety
    });

    // In production, this would use HSM to decrypt masterKeyWrappedContent
    // For now, return placeholder decrypted content
    const decryptedMessages: DecryptedMessageDTO[] = messages.map((m: any) => ({
      messageId: m.messageId,
      conversationId: m.conversationId,
      senderProfileId: m.senderProfileId,
      senderDisplayName: m.senderProfileId, // TODO: Fetch actual name
      type: m.type as any,
      decryptedContent: `[Decrypted content for message ${m.messageId}]`,
      linkedTransactionId: m.linkedTransactionId,
      createdAt: m.createdAt.toISOString(),
    }));

    // Update audit record
    await db.masterKeyDecryptionAudit.update({
      where: { auditId: requestId },
      data: {
        executedAt: new Date(),
        messagesDecrypted: messages.length,
      },
    });

    logger.info(
      { requestId, executedByAdminId, messagesDecrypted: messages.length },
      'Decryption executed'
    );

    return {
      messagesDecrypted: messages.length,
      messages: decryptedMessages,
    };
  }

  /**
   * Get audit log
   */
  async getAuditLog(options: AuditLogOptions): Promise<{
    audits: DecryptionAuditDTO[];
    pagination: { limit: number; offset: number; hasMore: boolean };
  }> {
    const where: any = {};

    if (options.startDate) {
      where.createdAt = { gte: new Date(options.startDate) };
    }
    if (options.endDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(options.endDate) };
    }

    const [audits, total] = await Promise.all([
      db.masterKeyDecryptionAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit,
        skip: options.offset,
      }),
      db.masterKeyDecryptionAudit.count({ where }),
    ]);

    return {
      audits: audits.map((a: any) => this.auditToDTO(a)),
      pagination: {
        limit: options.limit,
        offset: options.offset,
        hasMore: options.offset + audits.length < total,
      },
    };
  }

  /**
   * Get compliance statistics
   */
  async getStats(): Promise<{
    totalRequests: number;
    pendingRequests: number;
    approvedRequests: number;
    rejectedRequests: number;
    executedRequests: number;
    totalMessagesDecrypted: number;
    requestsByReason: Record<string, number>;
  }> {
    const [
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      executedRequests,
      messagesDecryptedSum,
    ] = await Promise.all([
      db.masterKeyDecryptionAudit.count(),
      db.masterKeyDecryptionAudit.count({ where: { approvedAt: null, rejectedAt: null } }),
      db.masterKeyDecryptionAudit.count({ where: { approvedAt: { not: null }, rejectedAt: null } }),
      db.masterKeyDecryptionAudit.count({ where: { rejectedAt: { not: null } } }),
      db.masterKeyDecryptionAudit.count({ where: { executedAt: { not: null } } }),
      db.masterKeyDecryptionAudit.aggregate({
        _sum: { messagesDecrypted: true },
      }),
    ]);

    // Group by reason
    const reasonCounts = await db.masterKeyDecryptionAudit.groupBy({
      by: ['reason'],
      _count: true,
    });

    const requestsByReason: Record<string, number> = {};
    for (const item of reasonCounts) {
      requestsByReason[item.reason] = item._count;
    }

    return {
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      executedRequests,
      totalMessagesDecrypted: messagesDecryptedSum._sum.messagesDecrypted || 0,
      requestsByReason,
    };
  }

  /**
   * Convert audit to DTO
   */
  private auditToDTO(audit: any): DecryptionAuditDTO {
    let status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' = 'PENDING';
    if (audit.executedAt) {
      status = 'EXECUTED';
    } else if (audit.rejectedAt) {
      status = 'REJECTED';
    } else if (audit.approvedAt) {
      status = 'APPROVED';
    }

    let targetType: 'MESSAGE' | 'CONVERSATION' | 'USER' = 'USER';
    let targetId = audit.targetProfileId;
    if (audit.targetMessageId) {
      targetType = 'MESSAGE';
      targetId = audit.targetMessageId;
    } else if (audit.targetConversationId) {
      targetType = 'CONVERSATION';
      targetId = audit.targetConversationId;
    }

    return {
      auditId: audit.auditId,
      requestedByAdminId: audit.requestedByAdminId,
      requestedByName: audit.requestedByAdminId, // TODO: Fetch actual name
      targetType,
      targetId,
      reason: audit.reason,
      justification: audit.justification,
      status,
      approvedByAdminId: audit.approvedByAdminId,
      approvedByName: audit.approvedByAdminId, // TODO: Fetch actual name
      messagesDecrypted: audit.messagesDecrypted,
      createdAt: audit.createdAt.toISOString(),
      approvedAt: audit.approvedAt?.toISOString() || null,
      executedAt: audit.executedAt?.toISOString() || null,
    };
  }
}

export const complianceService = new ComplianceService();
