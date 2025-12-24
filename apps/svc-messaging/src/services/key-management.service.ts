import { db } from '@gx/core-db';
import { logger } from '@gx/core-logger';
import { v4 as uuidv4 } from 'uuid';
import { RegisterKeysDTO, PreKeyDTO, KeyBundleDTO, GroupKeyDTO } from '../types/dtos';
import { encryptionService } from './encryption.service';

class KeyManagementService {
  /**
   * Register user's encryption key bundle
   */
  async registerKeys(profileId: string, dto: RegisterKeysDTO): Promise<void> {
    logger.info({ profileId, preKeyCount: dto.preKeys.length }, 'Registering user keys');

    // Deactivate existing keys
    await db.userSignalKey.updateMany({
      where: { profileId, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });

    // Generate registration ID if not provided
    const registrationId = Math.floor(Math.random() * 16383) + 1;

    // Create new key record
    const userKey = await db.userSignalKey.create({
      data: {
        keyId: uuidv4(),
        tenantId: 'default',
        profileId,
        identityKeyPublic: dto.identityKeyPublic,
        identityKeyPrivate: '', // Private key stored client-side only
        registrationId,
        signedPreKeyId: dto.signedPreKeyId,
        signedPreKeyPublic: dto.signedPreKeyPublic,
        signedPreKeyPrivate: '', // Private key stored client-side only
        signedPreKeySignature: dto.signedPreKeySignature,
        isActive: true,
      },
    });

    // Create pre-keys
    await db.signalPreKey.createMany({
      data: dto.preKeys.map((pk) => ({
        preKeyId: uuidv4(),
        tenantId: 'default',
        userKeyId: userKey.keyId,
        keyIndex: pk.keyIndex,
        publicKey: pk.publicKey,
        privateKey: '', // Private key stored client-side only
        isUsed: false,
      })),
    });

    logger.info({ profileId, keyId: userKey.keyId }, 'User keys registered successfully');
  }

  /**
   * Get user's pre-key bundle for session establishment
   */
  async getKeyBundle(profileId: string): Promise<KeyBundleDTO | null> {
    const userKey = await db.userSignalKey.findFirst({
      where: { profileId, isActive: true },
      include: {
        preKeys: {
          where: { isUsed: false },
          take: 1,
        },
      },
    });

    if (!userKey) {
      return null;
    }

    // Mark pre-key as used
    if (userKey.preKeys.length > 0) {
      await db.signalPreKey.update({
        where: { preKeyId: userKey.preKeys[0].preKeyId },
        data: { isUsed: true, usedAt: new Date() },
      });
    }

    return {
      profileId,
      identityKeyPublic: userKey.identityKeyPublic,
      signedPreKeyId: userKey.signedPreKeyId,
      signedPreKeyPublic: userKey.signedPreKeyPublic,
      signedPreKeySignature: userKey.signedPreKeySignature,
      preKey: userKey.preKeys.length > 0
        ? {
            keyIndex: userKey.preKeys[0].keyIndex,
            publicKey: userKey.preKeys[0].publicKey,
          }
        : null,
    };
  }

  /**
   * Upload new pre-keys
   */
  async uploadPreKeys(profileId: string, preKeys: PreKeyDTO[]): Promise<void> {
    const userKey = await db.userSignalKey.findFirst({
      where: { profileId, isActive: true },
    });

    if (!userKey) {
      throw new Error('User key not registered');
    }

    await db.signalPreKey.createMany({
      data: preKeys.map((pk) => ({
        preKeyId: uuidv4(),
        tenantId: 'default',
        userKeyId: userKey.keyId,
        keyIndex: pk.keyIndex,
        publicKey: pk.publicKey,
        privateKey: '',
        isUsed: false,
      })),
    });

    logger.info({ profileId, count: preKeys.length }, 'Pre-keys uploaded');
  }

  /**
   * Get count of remaining pre-keys
   */
  async getPreKeyCount(profileId: string): Promise<number> {
    const userKey = await db.userSignalKey.findFirst({
      where: { profileId, isActive: true },
    });

    if (!userKey) {
      return 0;
    }

    return db.signalPreKey.count({
      where: { userKeyId: userKey.keyId, isUsed: false },
    });
  }

  /**
   * Rotate signed pre-key
   */
  async rotateSignedPreKey(
    profileId: string,
    data: { signedPreKeyId: number; signedPreKeyPublic: string; signedPreKeySignature: string }
  ): Promise<void> {
    await db.userSignalKey.updateMany({
      where: { profileId, isActive: true },
      data: {
        signedPreKeyId: data.signedPreKeyId,
        signedPreKeyPublic: data.signedPreKeyPublic,
        signedPreKeySignature: data.signedPreKeySignature,
      },
    });

    logger.info({ profileId }, 'Signed pre-key rotated');
  }

  /**
   * Get group encryption key
   */
  async getGroupKey(conversationId: string, profileId: string): Promise<GroupKeyDTO | null> {
    const groupKey = await db.groupEncryptionKey.findFirst({
      where: { conversationId, isActive: true },
      include: {
        participantKeys: {
          where: { participantProfileId: profileId },
        },
      },
    });

    if (!groupKey || groupKey.participantKeys.length === 0) {
      return null;
    }

    return {
      keyId: groupKey.keyId,
      conversationId: groupKey.conversationId,
      keyVersion: groupKey.keyVersion,
      encryptedKey: groupKey.participantKeys[0].encryptedKey,
    };
  }

  /**
   * Rotate group encryption key
   */
  async rotateGroupKey(conversationId: string, initiatorProfileId: string): Promise<GroupKeyDTO> {
    logger.info({ conversationId, initiatorProfileId }, 'Rotating group key');

    // Deactivate current key
    await db.groupEncryptionKey.updateMany({
      where: { conversationId, isActive: true },
      data: { isActive: false, rotatedAt: new Date() },
    });

    // Get current version
    const currentKey = await db.groupEncryptionKey.findFirst({
      where: { conversationId },
      orderBy: { keyVersion: 'desc' },
    });

    const newVersion = (currentKey?.keyVersion || 0) + 1;

    // Generate new symmetric key
    const symmetricKey = encryptionService.generateSymmetricKey();

    // Wrap for master key escrow
    const masterKeyWrapped = await encryptionService.wrapForMasterKey(symmetricKey.toString('base64'));

    // Create new group key
    const newKey = await db.groupEncryptionKey.create({
      data: {
        keyId: uuidv4(),
        tenantId: 'default',
        conversationId,
        keyVersion: newVersion,
        createdByProfileId: initiatorProfileId,
        masterKeyWrapped,
        isActive: true,
      },
    });

    // Get all participants
    const participants = await db.conversationParticipant.findMany({
      where: { conversationId, leftAt: null },
    });

    // Wrap key for each participant (simplified - in production use Signal session)
    for (const participant of participants) {
      await db.groupParticipantKey.create({
        data: {
          id: uuidv4(),
          tenantId: 'default',
          groupKeyId: newKey.keyId,
          participantProfileId: participant.profileId,
          encryptedKey: symmetricKey.toString('base64'), // In production, wrap with participant's public key
        },
      });
    }

    logger.info({ conversationId, keyVersion: newVersion }, 'Group key rotated successfully');

    return {
      keyId: newKey.keyId,
      conversationId: newKey.conversationId,
      keyVersion: newKey.keyVersion,
      encryptedKey: symmetricKey.toString('base64'),
    };
  }
}

export const keyManagementService = new KeyManagementService();
