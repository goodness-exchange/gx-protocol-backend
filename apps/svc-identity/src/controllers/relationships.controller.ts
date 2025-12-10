import { Response, NextFunction } from 'express';
import { logger } from '@gx/core-logger';
import { relationshipsService } from '../services/relationships.service';
import type { AuthenticatedRequest } from '../types/dtos';

/**
 * Relationships Controller (KYR - Know Your Relationship)
 *
 * HTTP handlers for relationship management endpoints.
 * All endpoints require authentication.
 */

/**
 * GET /api/gxcoin/relationships
 *
 * Get all relationships for the authenticated user.
 * Returns:
 * - relationships: Relationships initiated by the user
 * - pendingInvites: Relationship requests awaiting user's confirmation
 * - trustScore: User's trust score breakdown
 */
export async function getRelationships(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const profileId = req.user?.profileId;
    if (!profileId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    logger.debug({ profileId }, 'GET /relationships');

    const result = await relationshipsService.getRelationships(profileId);

    res.json(result);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get relationships');
    next(error);
  }
}

/**
 * POST /api/gxcoin/relationships
 *
 * Create a new relationship request (invitation).
 * The target user must confirm before points are awarded.
 *
 * Body:
 * - email: Email address of the person to invite
 * - relationType: Type of relationship (FATHER, MOTHER, SPOUSE, etc.)
 */
export async function createRelationship(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const profileId = req.user?.profileId;
    if (!profileId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { email, relationType } = req.body;

    if (!email || !relationType) {
      res.status(400).json({ message: 'Email and relationship type are required' });
      return;
    }

    // Validate relationship type
    const validTypes = [
      'FATHER', 'MOTHER', 'SPOUSE', 'CHILD', 'SIBLING',
      'BUSINESS_PARTNER', 'DIRECTOR', 'WORKPLACE_ASSOCIATE', 'FRIEND'
    ];
    if (!validTypes.includes(relationType)) {
      res.status(400).json({
        message: 'Invalid relationship type',
        validTypes
      });
      return;
    }

    logger.info({ profileId, email, relationType }, 'POST /relationships');

    const relationship = await relationshipsService.createRelationship(profileId, {
      email,
      relationType
    });

    res.status(201).json({
      message: 'Relationship invitation sent',
      relationship
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to create relationship');

    if (error.message.includes('already exists')) {
      res.status(409).json({ message: error.message });
      return;
    }
    if (error.message.includes('yourself')) {
      res.status(400).json({ message: error.message });
      return;
    }

    next(error);
  }
}

/**
 * POST /api/gxcoin/relationships/:relationshipId/confirm
 *
 * Confirm a relationship request.
 * Only the invited user (relatedProfileId) can confirm.
 * Awards trust points to both parties.
 */
export async function confirmRelationship(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const profileId = req.user?.profileId;
    if (!profileId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { relationshipId } = req.params;
    if (!relationshipId) {
      res.status(400).json({ message: 'Relationship ID is required' });
      return;
    }

    logger.info({ profileId, relationshipId }, 'POST /relationships/:id/confirm');

    const relationship = await relationshipsService.confirmRelationship(
      relationshipId,
      profileId
    );

    res.json({
      message: 'Relationship confirmed',
      relationship
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to confirm relationship');

    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    if (error.message.includes('Only the invited')) {
      res.status(403).json({ message: error.message });
      return;
    }
    if (error.message.includes('not pending')) {
      res.status(400).json({ message: error.message });
      return;
    }

    next(error);
  }
}

/**
 * POST /api/gxcoin/relationships/:relationshipId/reject
 *
 * Reject a relationship request.
 * Only the invited user (relatedProfileId) can reject.
 */
export async function rejectRelationship(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const profileId = req.user?.profileId;
    if (!profileId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { relationshipId } = req.params;
    if (!relationshipId) {
      res.status(400).json({ message: 'Relationship ID is required' });
      return;
    }

    logger.info({ profileId, relationshipId }, 'POST /relationships/:id/reject');

    const relationship = await relationshipsService.rejectRelationship(
      relationshipId,
      profileId
    );

    res.json({
      message: 'Relationship rejected',
      relationship
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to reject relationship');

    if (error.message.includes('not found')) {
      res.status(404).json({ message: error.message });
      return;
    }
    if (error.message.includes('Only the invited')) {
      res.status(403).json({ message: error.message });
      return;
    }
    if (error.message.includes('not pending')) {
      res.status(400).json({ message: error.message });
      return;
    }

    next(error);
  }
}

/**
 * GET /api/gxcoin/relationships/trust-score
 *
 * Get trust score for the authenticated user.
 */
export async function getTrustScore(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const profileId = req.user?.profileId;
    if (!profileId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    logger.debug({ profileId }, 'GET /relationships/trust-score');

    const trustScore = await relationshipsService.getTrustScore(profileId);

    res.json({
      trustScore: trustScore || {
        familyScore: 0,
        businessScore: 0,
        friendsScore: 0,
        totalScore: 0,
        lastCalculatedAt: null
      }
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to get trust score');
    next(error);
  }
}
