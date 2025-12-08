import { Router, Response } from 'express';
import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { authenticateJWT } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../types/dtos';
import { randomUUID } from 'crypto';

/**
 * Transfer Routes
 *
 * Handles token transfer operations via CQRS outbox pattern.
 * Transfers are queued as commands and processed by the outbox-submitter worker.
 */

const router = Router();

/**
 * POST /api/v1/transfers
 * Submit a token transfer request
 *
 * Uses CQRS outbox pattern:
 * 1. Creates OutboxCommand with TRANSFER_TOKENS type
 * 2. Returns 202 Accepted with commandId
 * 3. Outbox-submitter processes and submits to blockchain
 *
 * @body {toID: string, amount: number, reason: string}
 * @returns {status: 'pending', commandId: string, message: string}
 */
router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { toID, amount, reason } = req.body;
    const profileId = req.user?.profileId;

    if (!profileId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    // Validate required fields
    if (!toID || amount === undefined || !reason) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'toID, amount, and reason are required',
      });
      return;
    }

    // Validate amount
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Amount must be a positive number',
      });
      return;
    }

    // Get sender's fabricUserId
    const sender = await db.userProfile.findUnique({
      where: { profileId },
      select: { fabricUserId: true, status: true },
    });

    if (!sender || !sender.fabricUserId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Your account is not registered on the blockchain yet',
      });
      return;
    }

    if (sender.status !== 'ACTIVE') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Your account is not active',
      });
      return;
    }

    // The toID could be a fabricUserId or a profileId - we need to determine which
    // First try to find by fabricUserId, then by profileId
    let recipientFabricId = toID;

    // Check if toID looks like a profileId (UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(toID)) {
      const recipient = await db.userProfile.findUnique({
        where: { profileId: toID },
        select: { fabricUserId: true },
      });
      if (recipient?.fabricUserId) {
        recipientFabricId = recipient.fabricUserId;
      }
    }

    // Prevent self-transfer
    if (recipientFabricId === sender.fabricUserId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot transfer to your own account',
      });
      return;
    }

    // Create OutboxCommand for the transfer
    const commandId = randomUUID();

    await db.outboxCommand.create({
      data: {
        id: commandId,
        tenantId: 'default',
        service: 'svc-identity',
        commandType: 'TRANSFER_TOKENS',
        requestId: `transfer-${commandId}`,
        payload: {
          fromUserId: sender.fabricUserId,
          toUserId: recipientFabricId,
          amount: Math.floor(amountNum), // Ensure integer for blockchain
          remark: reason,
        },
        status: 'PENDING',
        attempts: 0,
      },
    });

    logger.info({
      commandId,
      fromUserId: sender.fabricUserId,
      toUserId: recipientFabricId,
      amount: amountNum,
    }, 'Transfer command created');

    // Return 202 Accepted with command info
    res.status(202).json({
      status: 'pending',
      commandId,
      message: 'Transfer request submitted for processing',
      aggregateId: profileId,
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to create transfer command');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process transfer request',
    });
  }
});

/**
 * GET /api/v1/transfers/:commandId/status
 * Check the status of a transfer command
 *
 * @param commandId - The command ID returned from POST /transfers
 * @returns {commandId, status, result?, error?}
 */
router.get('/:commandId/status', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { commandId } = req.params;

    const command = await db.outboxCommand.findUnique({
      where: { id: commandId },
      select: {
        id: true,
        status: true,
        fabricTxId: true,
        commitBlock: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!command) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Command not found',
      });
      return;
    }

    // Map outbox status to CQRS status
    let cqrsStatus: 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'FAILED';
    switch (command.status) {
      case 'PENDING':
        cqrsStatus = 'PENDING';
        break;
      case 'PROCESSING':
        cqrsStatus = 'PROCESSING';
        break;
      case 'COMMITTED':
        cqrsStatus = 'CONFIRMED';
        break;
      case 'FAILED':
        cqrsStatus = 'FAILED';
        break;
      default:
        cqrsStatus = 'PENDING';
    }

    res.status(200).json({
      commandId: command.id,
      status: cqrsStatus,
      result: command.fabricTxId ? {
        transactionId: command.fabricTxId,
        blockNumber: command.commitBlock?.toString(),
      } : undefined,
      error: command.error || undefined,
      createdAt: command.createdAt.toISOString(),
      updatedAt: command.updatedAt.toISOString(),
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get transfer status');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get transfer status',
    });
  }
});

export default router;
