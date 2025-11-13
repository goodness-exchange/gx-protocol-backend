import { Request, Response } from 'express';
import { logger } from '@gx/core-logger';
import { authService } from '../services/auth.service';
import type { LoginRequestDTO, RefreshTokenRequestDTO } from '../types/dtos';

/**
 * Authentication Controller
 * 
 * Handles HTTP requests for authentication endpoints.
 * Delegates business logic to AuthService.
 */

class AuthController {
  /**
   * POST /api/v1/auth/login
   * User login endpoint
   * 
   * @param req.body {email, password}
   * @returns {accessToken, refreshToken, user}
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const credentials: LoginRequestDTO = req.body;

      // Validate request body
      if (!credentials.email || !credentials.password) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Email and password are required',
        });
        return;
      }

      // Perform login
      const result = await authService.login(credentials);

      logger.info({ profileId: result.user.profileId }, 'User login successful');

      res.status(200).json(result);
    } catch (error) {
      logger.error({ error }, 'Login failed');
      
      res.status(401).json({
        error: 'Unauthorized',
        message: (error as Error).message || 'Login failed',
      });
    }
  };

  /**
   * POST /api/v1/auth/refresh
   * Refresh access token endpoint
   * 
   * @param req.body {refreshToken}
   * @returns {accessToken}
   */
  refresh = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken }: RefreshTokenRequestDTO = req.body;

      if (!refreshToken) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Refresh token is required',
        });
        return;
      }

      const accessToken = await authService.refreshAccessToken(refreshToken);

      res.status(200).json({ accessToken });
    } catch (error) {
      logger.error({ error }, 'Token refresh failed');
      
      res.status(401).json({
        error: 'Unauthorized',
        message: (error as Error).message || 'Token refresh failed',
      });
    }
  };

  /**
   * POST /api/v1/auth/logout
   * User logout endpoint
   * 
   * @param req.body {refreshToken}
   * @returns {message}
   */
  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Refresh token is required',
        });
        return;
      }

      await authService.logout(refreshToken);

      res.status(200).json({
        message: 'Logout successful',
      });
    } catch (error) {
      logger.error({ error }, 'Logout failed');
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Logout failed',
      });
    }
  };
}

export const authController = new AuthController();
