import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middlewares/auth.middleware';

/**
 * Beneficiaries Routes (Stub)
 *
 * Provides beneficiary management endpoints for the send/transfer feature.
 * This is a stub implementation that returns empty data.
 *
 * TODO: Implement full beneficiary management with database persistence
 */

const router = Router();

/**
 * GET /api/v1/beneficiaries
 * Get user's saved beneficiaries
 *
 * @returns {beneficiaries: Beneficiary[]}
 */
router.get('/', authenticateJWT, async (_req: Request, res: Response) => {
  // Stub: Return empty beneficiaries list
  res.status(200).json({
    beneficiaries: [],
    total: 0,
  });
});

/**
 * POST /api/v1/beneficiaries
 * Add a new beneficiary
 *
 * @body {name: string, walletAddress: string, ...}
 * @returns {beneficiary: Beneficiary}
 */
router.post('/', authenticateJWT, async (req: Request, res: Response) => {
  // Stub: Return the submitted beneficiary with a generated ID
  const { name, walletAddress, nickname } = req.body;

  res.status(201).json({
    beneficiary: {
      id: `ben-${Date.now()}`,
      name: name || 'Unknown',
      walletAddress: walletAddress || '',
      nickname: nickname || null,
      isFavorite: false,
      createdAt: new Date().toISOString(),
    },
    message: 'Beneficiary added (stub - not persisted)',
  });
});

/**
 * PUT /api/v1/beneficiaries/:id
 * Update a beneficiary
 */
router.put('/:id', authenticateJWT, async (req: Request, res: Response) => {
  const { id } = req.params;

  res.status(200).json({
    beneficiary: {
      id,
      ...req.body,
      updatedAt: new Date().toISOString(),
    },
    message: 'Beneficiary updated (stub - not persisted)',
  });
});

/**
 * DELETE /api/v1/beneficiaries/:id
 * Delete a beneficiary
 */
router.delete('/:id', authenticateJWT, async (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Beneficiary deleted (stub - not persisted)',
  });
});

export default router;
