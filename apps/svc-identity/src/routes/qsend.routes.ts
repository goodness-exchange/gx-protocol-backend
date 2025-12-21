import { Router, Response } from 'express';
import { logger } from '@gx/core-logger';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { qsendService } from '../services/qsend.service';
import type { AuthenticatedRequest, QSendListQueryDTO, QSendStatus } from '../types/dtos';

/**
 * Q Send Routes
 *
 * QR-based payment request system endpoints.
 * All endpoints require JWT authentication.
 *
 * Routes:
 * - POST /api/v1/qsend              Create a new payment request
 * - GET  /api/v1/qsend              List user's payment requests
 * - GET  /api/v1/qsend/dashboard    Get dashboard with stats
 * - GET  /api/v1/qsend/:code        Get request by code
 * - POST /api/v1/qsend/verify       Verify scanned QR data
 * - POST /api/v1/qsend/:code/pay    Pay a request
 * - POST /api/v1/qsend/:code/cancel Cancel a request
 */

const router = Router();

/**
 * POST /api/v1/qsend
 * Create a new Q Send payment request
 *
 * @body {amount: number, description?: string, reference?: string, validitySeconds?: number}
 * @returns {QSendRequestDTO}
 */
router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profileId = req.user?.profileId;

    if (!profileId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const { amount, description, reference, validitySeconds } = req.body;

    // Validate amount
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Amount must be a positive number',
      });
      return;
    }

    // Validate description length
    if (description && description.length > 200) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Description cannot exceed 200 characters',
      });
      return;
    }

    const request = await qsendService.createRequest(
      profileId,
      {
        amount: Number(amount),
        description: description || undefined,
        reference: reference || undefined,
        validitySeconds: validitySeconds ? Number(validitySeconds) : undefined,
      },
      {
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      }
    );

    res.status(201).json(request);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to create Q Send request');
    res.status(400).json({
      error: 'Bad Request',
      message: error.message || 'Failed to create payment request',
    });
  }
});

/**
 * GET /api/v1/qsend
 * List user's Q Send requests with optional filters
 *
 * @query {status?: string, startDate?: string, endDate?: string, limit?: number, offset?: number, role?: string}
 * @returns {QSendRequestDTO[]}
 */
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profileId = req.user?.profileId;

    if (!profileId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const query: QSendListQueryDTO = {
      status: req.query.status as QSendStatus | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    };

    const role = (req.query.role as 'creator' | 'payer' | 'all') || 'creator';

    const requests = await qsendService.listRequests(profileId, query, role);

    res.status(200).json(requests);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to list Q Send requests');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve payment requests',
    });
  }
});

/**
 * GET /api/v1/qsend/dashboard
 * Get Q Send dashboard with statistics
 *
 * @returns {QSendDashboardDTO}
 */
router.get('/dashboard', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profileId = req.user?.profileId;

    if (!profileId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const dashboard = await qsendService.getDashboard(profileId);

    res.status(200).json(dashboard);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get Q Send dashboard');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve dashboard',
    });
  }
});

/**
 * POST /api/v1/qsend/verify
 * Verify scanned QR data and return request details
 *
 * @body {qrData: string}
 * @returns {QSendVerifyResponseDTO}
 */
router.post('/verify', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { qrData } = req.body;

    if (!qrData) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'qrData is required',
      });
      return;
    }

    const result = await qsendService.verifyQRData(qrData);

    res.status(200).json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to verify Q Send QR data');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify QR code',
    });
  }
});

/**
 * GET /api/v1/qsend/:code
 * Get a Q Send request by its code
 *
 * @param code - The request code (e.g., "QS-A1B2C3D4")
 * @returns {QSendRequestDTO}
 */
router.get('/:code', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.params;

    const request = await qsendService.getByRequestCode(code);

    if (!request) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Payment request not found',
      });
      return;
    }

    res.status(200).json(request);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get Q Send request');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve payment request',
    });
  }
});

/**
 * POST /api/v1/qsend/:code/pay
 * Pay a Q Send request
 *
 * @param code - The request code (e.g., "QS-A1B2C3D4")
 * @returns {QSendPayResponseDTO}
 */
router.post('/:code/pay', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profileId = req.user?.profileId;
    const { code } = req.params;

    if (!profileId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const result = await qsendService.pay(profileId, code);

    res.status(202).json({
      status: 'pending',
      commandId: result.commandId,
      message: 'Payment submitted for processing',
      request: result.request,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to process Q Send payment');
    res.status(400).json({
      error: 'Bad Request',
      message: error.message || 'Failed to process payment',
    });
  }
});

/**
 * POST /api/v1/qsend/:code/cancel
 * Cancel a Q Send request (creator only)
 *
 * @param code - The request code (e.g., "QS-A1B2C3D4")
 * @returns {QSendRequestDTO}
 */
router.post('/:code/cancel', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profileId = req.user?.profileId;
    const { code } = req.params;

    if (!profileId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated',
      });
      return;
    }

    const request = await qsendService.cancel(profileId, code);

    res.status(200).json(request);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to cancel Q Send request');
    res.status(400).json({
      error: 'Bad Request',
      message: error.message || 'Failed to cancel request',
    });
  }
});

export default router;
