import { Request, Response } from 'express';
import { logger } from '@gx/core-logger';
import { registrationService } from '../services/registration.service';

/**
 * Progressive Registration Controller
 *
 * Handles HTTP requests for the 7-step registration flow.
 * Each endpoint validates input and delegates to the registration service.
 *
 * Test OTP: During development/testing, use "111111" as the OTP code for both
 * email and phone verification.
 */
class RegistrationController {
  /**
   * Step 1: Submit email address
   * POST /api/v1/registration/email
   */
  async submitEmail(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Email is required',
        });
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          error: 'Invalid email format',
        });
        return;
      }

      const ipAddress = req.ip || req.headers['x-forwarded-for'] as string;
      const userAgent = req.headers['user-agent'];

      const result = await registrationService.submitEmail(email, ipAddress, userAgent);

      res.status(201).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Error in submitEmail');
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * Step 2: Verify email OTP
   * POST /api/v1/registration/email/verify
   */
  async verifyEmailOtp(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, otp } = req.body;

      if (!registrationId || !otp) {
        res.status(400).json({
          success: false,
          error: 'Registration ID and OTP are required',
        });
        return;
      }

      const result = await registrationService.verifyEmailOtp(registrationId, otp);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Error in verifyEmailOtp');
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * Resend email OTP
   * POST /api/v1/registration/email/resend
   */
  async resendEmailOtp(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId } = req.body;

      if (!registrationId) {
        res.status(400).json({
          success: false,
          error: 'Registration ID is required',
        });
        return;
      }

      const result = await registrationService.resendEmailOtp(registrationId);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Error in resendEmailOtp');
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * Step 3: Submit name and country
   * POST /api/v1/registration/name-country
   */
  async submitNameCountry(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, firstName, lastName, countryCode } = req.body;

      if (!registrationId || !firstName || !lastName || !countryCode) {
        res.status(400).json({
          success: false,
          error: 'Registration ID, first name, last name, and country code are required',
        });
        return;
      }

      // Validate name lengths
      if (firstName.length < 2 || firstName.length > 50) {
        res.status(400).json({
          success: false,
          error: 'First name must be between 2 and 50 characters',
        });
        return;
      }

      if (lastName.length < 2 || lastName.length > 50) {
        res.status(400).json({
          success: false,
          error: 'Last name must be between 2 and 50 characters',
        });
        return;
      }

      // Validate country code format
      if (!/^[A-Za-z]{2}$/.test(countryCode)) {
        res.status(400).json({
          success: false,
          error: 'Country code must be a 2-letter ISO code',
        });
        return;
      }

      const result = await registrationService.submitNameCountry(
        registrationId,
        firstName,
        lastName,
        countryCode
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Error in submitNameCountry');
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * Step 4: Submit date of birth and gender
   * POST /api/v1/registration/dob-gender
   */
  async submitDobGender(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, dateOfBirth, gender } = req.body;

      if (!registrationId || !dateOfBirth || !gender) {
        res.status(400).json({
          success: false,
          error: 'Registration ID, date of birth, and gender are required',
        });
        return;
      }

      // Validate gender
      const normalizedGender = gender.toUpperCase();
      if (!['MALE', 'FEMALE'].includes(normalizedGender)) {
        res.status(400).json({
          success: false,
          error: 'Gender must be MALE or FEMALE',
        });
        return;
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateOfBirth)) {
        res.status(400).json({
          success: false,
          error: 'Date of birth must be in YYYY-MM-DD format',
        });
        return;
      }

      const result = await registrationService.submitDobGender(
        registrationId,
        dateOfBirth,
        normalizedGender as 'MALE' | 'FEMALE'
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Error in submitDobGender');
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * Step 5: Create password
   * POST /api/v1/registration/password
   */
  async submitPassword(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, password, confirmPassword } = req.body;

      if (!registrationId || !password || !confirmPassword) {
        res.status(400).json({
          success: false,
          error: 'Registration ID, password, and confirm password are required',
        });
        return;
      }

      const result = await registrationService.submitPassword(
        registrationId,
        password,
        confirmPassword
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Error in submitPassword');
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * Step 6: Submit phone number
   * POST /api/v1/registration/phone
   */
  async submitPhone(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, phoneNum } = req.body;

      if (!registrationId || !phoneNum) {
        res.status(400).json({
          success: false,
          error: 'Registration ID and phone number are required',
        });
        return;
      }

      // Basic phone validation (allows + prefix and digits)
      const phoneRegex = /^\+?[1-9]\d{6,14}$/;
      const normalizedPhone = phoneNum.replace(/[\s-]/g, '');
      if (!phoneRegex.test(normalizedPhone)) {
        res.status(400).json({
          success: false,
          error: 'Invalid phone number format. Include country code (e.g., +1234567890)',
        });
        return;
      }

      const result = await registrationService.submitPhone(registrationId, phoneNum);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Error in submitPhone');
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * Step 7: Verify phone OTP (Final step)
   * POST /api/v1/registration/phone/verify
   */
  async verifyPhoneOtp(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, otp } = req.body;

      if (!registrationId || !otp) {
        res.status(400).json({
          success: false,
          error: 'Registration ID and OTP are required',
        });
        return;
      }

      const result = await registrationService.verifyPhoneOtp(registrationId, otp);

      res.status(200).json({
        success: true,
        message: 'Registration completed successfully',
        ...result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Error in verifyPhoneOtp');
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * Resend phone OTP
   * POST /api/v1/registration/phone/resend
   */
  async resendPhoneOtp(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId } = req.body;

      if (!registrationId) {
        res.status(400).json({
          success: false,
          error: 'Registration ID is required',
        });
        return;
      }

      const result = await registrationService.resendPhoneOtp(registrationId);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Error in resendPhoneOtp');
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }

  /**
   * Get registration progress
   * GET /api/v1/registration/:registrationId
   */
  async getRegistrationStatus(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId } = req.params;

      if (!registrationId) {
        res.status(400).json({
          success: false,
          error: 'Registration ID is required',
        });
        return;
      }

      const result = await registrationService.getRegistrationStatus(registrationId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error({ error }, 'Error in getRegistrationStatus');
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal server error',
      });
    }
  }
}

export const registrationController = new RegistrationController();
