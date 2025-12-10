import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import crypto from 'crypto';
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
 *
 * ENTERPRISE FEATURES:
 * - Cooldown period after rejection (7 days)
 * - Referral tracking with Fabric User ID for future rewards
 * - Email invitations for non-registered users
 * - In-app notifications for registered users
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

// Cooldown period after rejection (7 days in milliseconds)
const REJECTION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// Response type for relationship creation
export interface CreateRelationshipResult {
  relationship: RelationshipDTO;
  userExists: boolean;
  invitationSent: boolean;
  message: string;
}

// Detailed relationship info for approval modal
export interface RelationshipDetailDTO {
  relationshipId: string;
  relationType: RelationType;
  status: RelationshipStatus;
  createdAt: Date;
  initiator: {
    profileId: string;
    firstName: string;
    lastName: string;
    email?: string;
    fabricUserId?: string;
    nationalityCountryCode?: string;
    status?: string;
  };
}

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
   * ENTERPRISE FLOW:
   * 1. Check if target user exists on platform
   * 2. If NOT exists → Send invitation email with referrer tracking
   * 3. If EXISTS → Send in-app notification
   * 4. Check for cooldown if previously rejected
   *
   * Uses CQRS pattern - writes to OutboxCommand for Fabric submission.
   *
   * @param initiatorProfileId - Profile ID of user sending the invitation
   * @param data - Relationship request data
   * @returns Created relationship with status flags
   */
  async createRelationship(
    initiatorProfileId: string,
    data: CreateRelationshipRequestDTO
  ): Promise<CreateRelationshipResult> {
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

    // Check for existing relationship or cooldown period
    const existingRelationship = await db.familyRelationship.findFirst({
      where: {
        initiatorProfileId,
        OR: [
          { relatedProfileId: targetUser?.profileId },
          { relatedEmail: normalizedEmail }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    if (existingRelationship) {
      // Check if pending or confirmed - block duplicate
      if (existingRelationship.status === 'PENDING') {
        throw new Error('You already have a pending relationship request with this user');
      }
      if (existingRelationship.status === 'CONFIRMED') {
        throw new Error('You already have a confirmed relationship with this user');
      }

      // Check cooldown period for rejected relationships
      if (existingRelationship.status === 'REJECTED' && existingRelationship.rejectedAt) {
        const timeSinceRejection = Date.now() - existingRelationship.rejectedAt.getTime();
        if (timeSinceRejection < REJECTION_COOLDOWN_MS) {
          const daysRemaining = Math.ceil((REJECTION_COOLDOWN_MS - timeSinceRejection) / (24 * 60 * 60 * 1000));
          throw new Error(`This user previously declined your request. You can try again in ${daysRemaining} day(s).`);
        }
      }
    }

    // Generate invitation token for tracking (used for non-registered users)
    const invitationToken = crypto.randomBytes(32).toString('hex');

    // Create relationship record
    const relationship = await db.familyRelationship.create({
      data: {
        tenantId: 'default',
        initiatorProfileId,
        relatedProfileId: targetUser?.profileId || null,
        relatedEmail: targetUser ? null : normalizedEmail, // Store email if off-platform
        relationType,
        status: 'PENDING',
        pointsAwarded: 0,
        // Store referrer info for future rewards system
        statusRemarks: targetUser ? null : JSON.stringify({
          invitationToken,
          referrerFabricId: initiator.fabricUserId,
          referrerProfileId: initiatorProfileId,
          invitedAt: new Date().toISOString()
        })
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

    let invitationSent = false;
    let message = '';

    if (targetUser) {
      // User exists - send in-app notification
      await db.notification.create({
        data: {
          tenantId: 'default',
          profileId: targetUser.profileId,
          type: 'RELATIONSHIP_REQUEST',
          title: 'New Relationship Request',
          message: `${initiator.firstName} ${initiator.lastName} wants to establish a ${relationType.toLowerCase().replace('_', ' ')} relationship with you. Open to view details and respond.`,
          payload: {
            relationshipId: relationship.relationshipId,
            initiatorProfileId: initiatorProfileId,
            initiatorName: `${initiator.firstName} ${initiator.lastName}`,
            relationType,
            actionUrl: '/settings/relationships'
          },
          isRead: false
        }
      });
      message = 'Relationship request sent! They will receive a notification to confirm.';
    } else {
      // User doesn't exist - queue invitation email
      await db.outboxCommand.create({
        data: {
          tenantId: 'default',
          commandType: 'SEND_INVITATION_EMAIL',
          aggregateId: relationship.relationshipId,
          payload: {
            recipientEmail: normalizedEmail,
            invitationToken,
            referrerName: `${initiator.firstName} ${initiator.lastName}`,
            referrerFabricId: initiator.fabricUserId,
            relationType,
            relationshipId: relationship.relationshipId
          },
          status: 'PENDING'
        }
      });
      invitationSent = true;
      message = `User not registered. We've sent an invitation to ${normalizedEmail}. Try again once they join the platform.`;
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
          relationType,
          referrerFabricId: initiator.fabricUserId // Track for future rewards
        },
        status: 'PENDING'
      }
    });

    logger.info(
      {
        relationshipId: relationship.relationshipId,
        targetUserExists: !!targetUser,
        invitationSent
      },
      'Relationship request created'
    );

    return {
      relationship: {
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
      },
      userExists: !!targetUser,
      invitationSent,
      message
    };
  }

  /**
   * Get detailed relationship info for approval modal
   *
   * Returns full initiator details so target user can make informed decision.
   *
   * @param relationshipId - Relationship ID
   * @param profileId - Profile ID of user viewing (must be the target)
   * @returns Detailed relationship information
   */
  async getRelationshipDetail(
    relationshipId: string,
    profileId: string
  ): Promise<RelationshipDetailDTO> {
    const relationship = await db.familyRelationship.findUnique({
      where: { relationshipId },
      include: {
        initiatorProfile: {
          select: {
            profileId: true,
            firstName: true,
            lastName: true,
            email: true,
            fabricUserId: true,
            nationalityCountryCode: true,
            status: true
          }
        }
      }
    });

    if (!relationship) {
      throw new Error('Relationship not found');
    }

    // Only the target user can view details
    if (relationship.relatedProfileId !== profileId) {
      throw new Error('You do not have permission to view this relationship');
    }

    if (!relationship.initiatorProfile) {
      throw new Error('Initiator profile not found');
    }

    return {
      relationshipId: relationship.relationshipId,
      relationType: relationship.relationType as RelationType,
      status: relationship.status as RelationshipStatus,
      createdAt: relationship.createdAt,
      initiator: {
        profileId: relationship.initiatorProfile.profileId,
        firstName: relationship.initiatorProfile.firstName,
        lastName: relationship.initiatorProfile.lastName,
        email: relationship.initiatorProfile.email || undefined,
        fabricUserId: relationship.initiatorProfile.fabricUserId || undefined,
        nationalityCountryCode: relationship.initiatorProfile.nationalityCountryCode || undefined,
        status: relationship.initiatorProfile.status || undefined
      }
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
