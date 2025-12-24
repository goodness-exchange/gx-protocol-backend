import { Response } from 'express';
import { logger } from '@gx/core-logger';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { keyManagementService } from '../services/key-management.service';
import { RegisterKeysDTO, PreKeyDTO } from '../types/dtos';

class KeyController {
  /**
   * Register user's encryption key bundle
   */
  registerKeys = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.profileId;
      const body = req.body as RegisterKeysDTO;

      await keyManagementService.registerKeys(userId, body);

      res.status(201).json({
        success: true,
        message: 'Keys registered successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to register keys');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to register keys',
      });
    }
  };

  /**
   * Get user's pre-key bundle
   */
  getKeyBundle = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { profileId } = req.params;

      const bundle = await keyManagementService.getKeyBundle(profileId);

      if (!bundle) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Key bundle not found for user',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: bundle,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get key bundle');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get key bundle',
      });
    }
  };

  /**
   * Upload new pre-keys
   */
  uploadPreKeys = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.profileId;
      const preKeys = req.body.preKeys as PreKeyDTO[];

      await keyManagementService.uploadPreKeys(userId, preKeys);

      res.status(200).json({
        success: true,
        message: 'Pre-keys uploaded successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to upload pre-keys');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to upload pre-keys',
      });
    }
  };

  /**
   * Get pre-key count
   */
  getPreKeyCount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.profileId;

      const count = await keyManagementService.getPreKeyCount(userId);

      res.status(200).json({
        success: true,
        data: { count },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get pre-key count');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get pre-key count',
      });
    }
  };

  /**
   * Rotate signed pre-key
   */
  rotateSignedPreKey = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.profileId;
      const { signedPreKeyId, signedPreKeyPublic, signedPreKeySignature } = req.body;

      await keyManagementService.rotateSignedPreKey(userId, {
        signedPreKeyId,
        signedPreKeyPublic,
        signedPreKeySignature,
      });

      res.status(200).json({
        success: true,
        message: 'Signed pre-key rotated successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to rotate signed pre-key');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to rotate signed pre-key',
      });
    }
  };

  /**
   * Get group encryption key
   */
  getGroupKey = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.profileId;

      const key = await keyManagementService.getGroupKey(conversationId, userId);

      if (!key) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Group key not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: key,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get group key');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get group key',
      });
    }
  };

  /**
   * Rotate group encryption key
   */
  rotateGroupKey = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.profileId;

      const key = await keyManagementService.rotateGroupKey(conversationId, userId);

      res.status(200).json({
        success: true,
        data: key,
        message: 'Group key rotated successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to rotate group key');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to rotate group key',
      });
    }
  };
}

export const keyController = new KeyController();
