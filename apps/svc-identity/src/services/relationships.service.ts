import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import type {
  CreateRelationshipRequestDTO,
  RelationshipDTO,
  TrustScoreDTO,
  RelationshipsResponseDTO,
  RelationType,
  RelationshipStatus
} from '../types/dtos';

/**
 * Relationships Service (KYR - Know Your Relationship)
 *
 * Handles relationship management between users for building trust scores.
 *
 * ARCHITECTURE:
 * - Write operations → OutboxCommand table → Fabric chaincode
 * - Read operations → FamilyRelationship table (projected from Fabric events)
 *
 * Trust Score Algorithm:
 * - Family: Max 80 points (Father/Mother: 30, Spouse: 25, Sibling: 15, Child: 10)
 * - Business: Max 10 points (Partner: 5, Director: 3, Associate: 2)
 * - Friends: Max 10 points (1 point per friend, max 10)
 * - Total: Max 100 points
 */

// Points awarded for each relationship type
const RELATIONSHIP_POINTS: Record<RelationType, number> = {
  FATHER: 30,
  MOTHER: 30,
  SPOUSE: 25,
  CHILD: 10,
  SIBLING: 15,
  BUSINESS_PARTNER: 5,
  DIRECTOR: 3,
  WORKPLACE_ASSOCIATE: 2,
  FRIEND: 1
};

// Categorize relationship types
const FAMILY_TYPES: RelationType[] = ['FATHER', 'MOTHER', 'SPOUSE', 'CHILD', 'SIBLING'];
const BUSINESS_TYPES: RelationType[] = ['BUSINESS_PARTNER', 'DIRECTOR', 'WORKPLACE_ASSOCIATE'];
const FRIEND_TYPES: RelationType[] = ['FRIEND'];

class RelationshipsService {
  /**
   * Get all relationships for a user
   *
   * Returns relationships initiated by user and relationships where user is the target.
   * Also returns pending invites that the user needs to confirm/reject.
   *
   * @param profileId - User Profile ID
   * @returns Relationships, pending invites, and trust score
   */
  async getRelationships(profileId: string): Promise<RelationshipsResponseDTO> {
    logger.debug({ profileId }, 'Fetching relationships');

    // Get relationships where user is initiator
    const initiatedRelationships = await db.familyRelationship.findMany({
      where: {
        initiatorProfileId: profileId
      },
      include: {
        relatedProfile: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get relationships where user is the target (their pending invites)
    const pendingInvites = await db.familyRelationship.findMany({
      where: {
        relatedProfileId: profileId,
        status: 'PENDING'
      },
      include: {
        initiatorProfile: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get trust score
    const trustScore = await this.getTrustScore(profileId);

    // Transform to DTOs
    const relationships: RelationshipDTO[] = initiatedRelationships.map((rel: typeof initiatedRelationships[number]) => ({
      relationshipId: rel.relationshipId,
      relationType: rel.relationType as RelationType,
      status: rel.status as RelationshipStatus,
      relatedProfile: rel.relatedProfile ? {
        profileId: rel.relatedProfile.profileId,
        firstName: rel.relatedProfile.firstName,
        lastName: rel.relatedProfile.lastName,
        email: rel.relatedProfile.email || undefined
      } : null,
      relatedEmail: rel.relatedEmail,
      pointsAwarded: rel.pointsAwarded,
      confirmedAt: rel.confirmedAt,
      createdAt: rel.createdAt
    }));

    const pendingInviteDTOs: RelationshipDTO[] = pendingInvites.map((rel: typeof pendingInvites[number]) => ({
      relationshipId: rel.relationshipId,
      relationType: rel.relationType as RelationType,
      status: rel.status as RelationshipStatus,
      relatedProfile: rel.initiatorProfile ? {
        profileId: rel.initiatorProfile.profileId,
        firstName: rel.initiatorProfile.firstName,
        lastName: rel.initiatorProfile.lastName,
        email: rel.initiatorProfile.email || undefined
      } : null,
      relatedEmail: null,
      pointsAwarded: rel.pointsAwarded,
      confirmedAt: rel.confirmedAt,
      createdAt: rel.createdAt
    }));

    return {
      relationships,
      pendingInvites: pendingInviteDTOs,
      trustScore
    };
  }

  /**
   * Get trust score for a user
   *
   * @param profileId - User Profile ID
   * @returns Trust score breakdown
   */
  async getTrustScore(profileId: string): Promise<TrustScoreDTO | null> {
    const trustScore = await db.trustScore.findUnique({
      where: { profileId }
    });

    if (!trustScore) {
      return null;
    }

    return {
      familyScore: trustScore.familyScore,
      businessScore: trustScore.businessScore,
      friendsScore: trustScore.friendsScore,
      totalScore: trustScore.totalScore,
      lastCalculatedAt: trustScore.lastCalculatedAt
    };
  }

  /**
   * Create a relationship request (invitation)
   *
   * This creates a PENDING relationship that the target user must confirm.
   * Uses CQRS pattern - writes to OutboxCommand for Fabric submission.
   *
   * @param initiatorProfileId - Profile ID of user sending the invitation
   * @param data - Relationship request data
   * @returns Created relationship
   */
  async createRelationship(
    initiatorProfileId: string,
    data: CreateRelationshipRequestDTO
  ): Promise<RelationshipDTO> {
    const { email, relationType } = data;
    const normalizedEmail = email.toLowerCase();

    logger.info({ initiatorProfileId, email: normalizedEmail, relationType }, 'Creating relationship request');

    // Check if initiator exists
    const initiator = await db.userProfile.findUnique({
      where: { profileId: initiatorProfileId }
    });

    if (!initiator) {
      throw new Error('Initiator profile not found');
    }

    // Prevent self-relationship
    if (initiator.email?.toLowerCase() === normalizedEmail) {
      throw new Error('Cannot create relationship with yourself');
    }

    // Check if target user exists on platform
    const targetUser = await db.userProfile.findUnique({
      where: { email: normalizedEmail }
    });

    // Check for existing relationship
    const existingRelationship = await db.familyRelationship.findFirst({
      where: {
        initiatorProfileId,
        OR: [
          { relatedProfileId: targetUser?.profileId },
          { relatedEmail: normalizedEmail }
        ],
        relationType
      }
    });

    if (existingRelationship) {
      throw new Error('Relationship request already exists');
    }

    // Create relationship
    const relationship = await db.familyRelationship.create({
      data: {
        tenantId: 'default',
        initiatorProfileId,
        relatedProfileId: targetUser?.profileId || null,
        relatedEmail: targetUser ? null : normalizedEmail, // Store email if off-platform
        relationType,
        status: 'PENDING',
        pointsAwarded: 0
      },
      include: {
        relatedProfile: targetUser ? {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            email: true
          }
        } : undefined
      }
    });

    // Create notification for target user if they're on platform
    if (targetUser) {
      await db.notification.create({
        data: {
          tenantId: 'default',
          profileId: targetUser.profileId,
          type: 'RELATIONSHIP_REQUEST',
          title: 'New Relationship Request',
          message: `${initiator.firstName} ${initiator.lastName} has invited you to confirm your relationship as their ${relationType.toLowerCase().replace('_', ' ')}.`,
          payload: {
            relationshipId: relationship.relationshipId,
            initiatorName: `${initiator.firstName} ${initiator.lastName}`,
            relationType
          },
          isRead: false
        }
      });
    }

    // Create OutboxCommand for Fabric submission
    await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        commandType: 'REQUEST_RELATIONSHIP',
        aggregateId: relationship.relationshipId,
        payload: {
          relationshipId: relationship.relationshipId,
          subjectId: initiator.fabricUserId || initiatorProfileId,
          objectId: targetUser?.fabricUserId || normalizedEmail,
          relationType
        },
        status: 'PENDING'
      }
    });

    logger.info(
      { relationshipId: relationship.relationshipId, targetUser: !!targetUser },
      'Relationship request created'
    );

    return {
      relationshipId: relationship.relationshipId,
      relationType: relationship.relationType as RelationType,
      status: relationship.status as RelationshipStatus,
      relatedProfile: relationship.relatedProfile ? {
        profileId: relationship.relatedProfile.profileId,
        firstName: relationship.relatedProfile.firstName,
        lastName: relationship.relatedProfile.lastName,
        email: relationship.relatedProfile.email || undefined
      } : null,
      relatedEmail: relationship.relatedEmail,
      pointsAwarded: relationship.pointsAwarded,
      confirmedAt: relationship.confirmedAt,
      createdAt: relationship.createdAt
    };
  }

  /**
   * Confirm a relationship request
   *
   * Only the target user (relatedProfileId) can confirm.
   * Updates trust scores for both parties.
   *
   * @param relationshipId - Relationship ID
   * @param confirmingProfileId - Profile ID of user confirming
   * @returns Updated relationship
   */
  async confirmRelationship(
    relationshipId: string,
    confirmingProfileId: string
  ): Promise<RelationshipDTO> {
    logger.info({ relationshipId, confirmingProfileId }, 'Confirming relationship');

    const relationship = await db.familyRelationship.findUnique({
      where: { relationshipId },
      include: {
        initiatorProfile: true,
        relatedProfile: true
      }
    });

    if (!relationship) {
      throw new Error('Relationship not found');
    }

    // Only the target user can confirm
    if (relationship.relatedProfileId !== confirmingProfileId) {
      throw new Error('Only the invited user can confirm this relationship');
    }

    if (relationship.status !== 'PENDING') {
      throw new Error('Relationship is not pending confirmation');
    }

    // Calculate points to award
    const points = RELATIONSHIP_POINTS[relationship.relationType as RelationType] || 0;

    // Update relationship
    const updated = await db.familyRelationship.update({
      where: { relationshipId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        pointsAwarded: points
      },
      include: {
        relatedProfile: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Update trust scores for both users
    await this.recalculateTrustScore(relationship.initiatorProfileId);
    if (relationship.relatedProfileId) {
      await this.recalculateTrustScore(relationship.relatedProfileId);
    }

    // Create OutboxCommand for Fabric confirmation
    await db.outboxCommand.create({
      data: {
        tenantId: 'default',
        commandType: 'CONFIRM_RELATIONSHIP',
        aggregateId: relationshipId,
        payload: {
          relationshipId,
          confirmingUserId: confirmingProfileId
        },
        status: 'PENDING'
      }
    });

    // Create notification for initiator
    if (relationship.initiatorProfile) {
      await db.notification.create({
        data: {
          tenantId: 'default',
          profileId: relationship.initiatorProfileId,
          type: 'RELATIONSHIP_CONFIRMED',
          title: 'Relationship Confirmed',
          message: `${relationship.relatedProfile?.firstName || 'Your contact'} has confirmed your relationship. You've earned ${points} trust points!`,
          payload: {
            relationshipId,
            pointsAwarded: points
          },
          isRead: false
        }
      });
    }

    logger.info({ relationshipId, points }, 'Relationship confirmed');

    return {
      relationshipId: updated.relationshipId,
      relationType: updated.relationType as RelationType,
      status: updated.status as RelationshipStatus,
      relatedProfile: updated.relatedProfile ? {
        profileId: updated.relatedProfile.profileId,
        firstName: updated.relatedProfile.firstName,
        lastName: updated.relatedProfile.lastName,
        email: updated.relatedProfile.email || undefined
      } : null,
      relatedEmail: updated.relatedEmail,
      pointsAwarded: updated.pointsAwarded,
      confirmedAt: updated.confirmedAt,
      createdAt: updated.createdAt
    };
  }

  /**
   * Reject a relationship request
   *
   * Only the target user (relatedProfileId) can reject.
   *
   * @param relationshipId - Relationship ID
   * @param rejectingProfileId - Profile ID of user rejecting
   * @returns Updated relationship
   */
  async rejectRelationship(
    relationshipId: string,
    rejectingProfileId: string
  ): Promise<RelationshipDTO> {
    logger.info({ relationshipId, rejectingProfileId }, 'Rejecting relationship');

    const relationship = await db.familyRelationship.findUnique({
      where: { relationshipId },
      include: {
        initiatorProfile: true
      }
    });

    if (!relationship) {
      throw new Error('Relationship not found');
    }

    // Only the target user can reject
    if (relationship.relatedProfileId !== rejectingProfileId) {
      throw new Error('Only the invited user can reject this relationship');
    }

    if (relationship.status !== 'PENDING') {
      throw new Error('Relationship is not pending');
    }

    const updated = await db.familyRelationship.update({
      where: { relationshipId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date()
      },
      include: {
        relatedProfile: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Notify initiator
    if (relationship.initiatorProfile) {
      await db.notification.create({
        data: {
          tenantId: 'default',
          profileId: relationship.initiatorProfileId,
          type: 'RELATIONSHIP_REJECTED',
          title: 'Relationship Request Declined',
          message: 'Your relationship request was declined.',
          payload: { relationshipId },
          isRead: false
        }
      });
    }

    logger.info({ relationshipId }, 'Relationship rejected');

    return {
      relationshipId: updated.relationshipId,
      relationType: updated.relationType as RelationType,
      status: updated.status as RelationshipStatus,
      relatedProfile: updated.relatedProfile ? {
        profileId: updated.relatedProfile.profileId,
        firstName: updated.relatedProfile.firstName,
        lastName: updated.relatedProfile.lastName,
        email: updated.relatedProfile.email || undefined
      } : null,
      relatedEmail: updated.relatedEmail,
      pointsAwarded: updated.pointsAwarded,
      confirmedAt: updated.confirmedAt,
      createdAt: updated.createdAt
    };
  }

  /**
   * Recalculate trust score for a user
   *
   * Called after relationship confirmation/changes.
   *
   * @param profileId - User Profile ID
   */
  async recalculateTrustScore(profileId: string): Promise<void> {
    logger.debug({ profileId }, 'Recalculating trust score');

    // Get all confirmed relationships where user is involved
    const relationships = await db.familyRelationship.findMany({
      where: {
        OR: [
          { initiatorProfileId: profileId },
          { relatedProfileId: profileId }
        ],
        status: 'CONFIRMED'
      }
    });

    // Calculate scores by category
    let familyScore = 0;
    let businessScore = 0;
    let friendsScore = 0;

    for (const rel of relationships) {
      const relType = rel.relationType as RelationType;
      const points = RELATIONSHIP_POINTS[relType] || 0;

      if (FAMILY_TYPES.includes(relType)) {
        familyScore += points;
      } else if (BUSINESS_TYPES.includes(relType)) {
        businessScore += points;
      } else if (FRIEND_TYPES.includes(relType)) {
        friendsScore += points;
      }
    }

    // Apply caps
    familyScore = Math.min(familyScore, 80);
    businessScore = Math.min(businessScore, 10);
    friendsScore = Math.min(friendsScore, 10);

    const totalScore = familyScore + businessScore + friendsScore;

    // Upsert trust score
    await db.trustScore.upsert({
      where: { profileId },
      update: {
        familyScore,
        businessScore,
        friendsScore,
        totalScore,
        lastCalculatedAt: new Date()
      },
      create: {
        profileId,
        tenantId: 'default',
        familyScore,
        businessScore,
        friendsScore,
        totalScore,
        lastCalculatedAt: new Date()
      }
    });

    logger.info({ profileId, totalScore }, 'Trust score recalculated');
  }
}

export const relationshipsService = new RelationshipsService();
