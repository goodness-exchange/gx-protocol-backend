import { Request, Response } from 'express';
import { logger } from '@gx/core-logger';
import { registrationService } from '../services/registration.service';
import {
  validateEmail,
  validateName,
  validatePhoneNumber,
  validatePassword,
  validateDateOfBirth,
  validateGender,
  validateCountryCode,
  validateUUID,
  validateOTP,
  ValidationErrorCodes,
} from '@gx/core-http';

/**
 * API Error Response
 */
interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  field?: string;
  details?: Record<string, string>;
}

/**
 * Create standardized error response
 */
function errorResponse(
  message: string,
  code: string,
  field?: string,
  details?: Record<string, string>
): ApiErrorResponse {
  return {
    success: false,
    error: message,
    code,
    ...(field && { field }),
    ...(details && { details }),
  };
}

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

      // Validate email
      const emailValidation = validateEmail(email);
      if (!emailValidation.valid) {
        res.status(400).json(
          errorResponse(
            emailValidation.error!,
            ValidationErrorCodes.EMAIL_INVALID_FORMAT,
            'email'
          )
        );
        return;
      }

      const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string);
      const userAgent = req.headers['user-agent'];

      const result = await registrationService.submitEmail(
        emailValidation.sanitized!,
        ipAddress,
        userAgent
      );

      res.status(201).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error, path: req.path }, 'Error in submitEmail');

      const statusCode = error.statusCode || 500;
      const code = statusCode === 409
        ? ValidationErrorCodes.EMAIL_ALREADY_EXISTS
        : ValidationErrorCodes.INTERNAL_ERROR;

      res.status(statusCode).json(
        errorResponse(error.message || 'Internal server error', code, 'email')
      );
    }
  }

  /**
   * Step 2: Verify email OTP
   * POST /api/v1/registration/email/verify
   */
  async verifyEmailOtp(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, otp } = req.body;

      // Validate registration ID
      const idValidation = validateUUID(registrationId, 'Registration ID');
      if (!idValidation.valid) {
        res.status(400).json(
          errorResponse(
            idValidation.error!,
            ValidationErrorCodes.REGISTRATION_NOT_FOUND,
            'registrationId'
          )
        );
        return;
      }

      // Validate OTP
      const otpValidation = validateOTP(otp);
      if (!otpValidation.valid) {
        res.status(400).json(
          errorResponse(
            otpValidation.error!,
            ValidationErrorCodes.OTP_INVALID_FORMAT,
            'otp'
          )
        );
        return;
      }

      const result = await registrationService.verifyEmailOtp(
        registrationId,
        otpValidation.sanitized!
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error, path: req.path }, 'Error in verifyEmailOtp');

      const statusCode = error.statusCode || 500;
      let code: string = ValidationErrorCodes.INTERNAL_ERROR;

      if (statusCode === 404) code = ValidationErrorCodes.REGISTRATION_NOT_FOUND;
      else if (statusCode === 410) code = ValidationErrorCodes.REGISTRATION_EXPIRED;
      else if (statusCode === 429) code = ValidationErrorCodes.OTP_MAX_ATTEMPTS;
      else if (error.message?.includes('expired')) code = ValidationErrorCodes.OTP_EXPIRED;
      else if (error.message?.includes('Invalid')) code = ValidationErrorCodes.OTP_INVALID;

      res.status(statusCode).json(
        errorResponse(error.message || 'Internal server error', code)
      );
    }
  }

  /**
   * Resend email OTP
   * POST /api/v1/registration/email/resend
   */
  async resendEmailOtp(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId } = req.body;

      // Validate registration ID
      const idValidation = validateUUID(registrationId, 'Registration ID');
      if (!idValidation.valid) {
        res.status(400).json(
          errorResponse(
            idValidation.error!,
            ValidationErrorCodes.REGISTRATION_NOT_FOUND,
            'registrationId'
          )
        );
        return;
      }

      const result = await registrationService.resendEmailOtp(registrationId);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error, path: req.path }, 'Error in resendEmailOtp');

      const statusCode = error.statusCode || 500;
      const code = statusCode === 404
        ? ValidationErrorCodes.REGISTRATION_NOT_FOUND
        : statusCode === 410
        ? ValidationErrorCodes.REGISTRATION_EXPIRED
        : ValidationErrorCodes.INTERNAL_ERROR;

      res.status(statusCode).json(
        errorResponse(error.message || 'Internal server error', code)
      );
    }
  }

  /**
   * Step 3: Submit name and country
   * POST /api/v1/registration/name-country
   */
  async submitNameCountry(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, firstName, lastName, countryCode } = req.body;
      const errors: Record<string, string> = {};

      // Validate registration ID
      const idValidation = validateUUID(registrationId, 'Registration ID');
      if (!idValidation.valid) {
        res.status(400).json(
          errorResponse(
            idValidation.error!,
            ValidationErrorCodes.REGISTRATION_NOT_FOUND,
            'registrationId'
          )
        );
        return;
      }

      // Validate first name
      const firstNameValidation = validateName(firstName, 'First name');
      if (!firstNameValidation.valid) {
        errors.firstName = firstNameValidation.error!;
      }

      // Validate last name
      const lastNameValidation = validateName(lastName, 'Last name');
      if (!lastNameValidation.valid) {
        errors.lastName = lastNameValidation.error!;
      }

      // Validate country code
      const countryValidation = validateCountryCode(countryCode);
      if (!countryValidation.valid) {
        errors.countryCode = countryValidation.error!;
      }

      // Return all validation errors at once
      if (Object.keys(errors).length > 0) {
        const firstError = Object.entries(errors)[0];
        res.status(400).json(
          errorResponse(
            firstError[1],
            ValidationErrorCodes.NAME_INVALID_CHARS,
            firstError[0],
            errors
          )
        );
        return;
      }

      const result = await registrationService.submitNameCountry(
        registrationId,
        firstNameValidation.sanitized!,
        lastNameValidation.sanitized!,
        countryValidation.normalized!
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error, path: req.path }, 'Error in submitNameCountry');

      const statusCode = error.statusCode || 500;
      let code: string = ValidationErrorCodes.INTERNAL_ERROR;

      if (statusCode === 404) code = ValidationErrorCodes.REGISTRATION_NOT_FOUND;
      else if (statusCode === 410) code = ValidationErrorCodes.REGISTRATION_EXPIRED;
      else if (error.message?.includes('country')) code = ValidationErrorCodes.COUNTRY_NOT_FOUND;
      else if (statusCode === 400) code = ValidationErrorCodes.REGISTRATION_STEP_INVALID;

      res.status(statusCode).json(
        errorResponse(error.message || 'Internal server error', code)
      );
    }
  }

  /**
   * Step 4: Submit date of birth and gender
   * POST /api/v1/registration/dob-gender
   */
  async submitDobGender(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, dateOfBirth, gender } = req.body;
      const errors: Record<string, string> = {};

      // Validate registration ID
      const idValidation = validateUUID(registrationId, 'Registration ID');
      if (!idValidation.valid) {
        res.status(400).json(
          errorResponse(
            idValidation.error!,
            ValidationErrorCodes.REGISTRATION_NOT_FOUND,
            'registrationId'
          )
        );
        return;
      }

      // Validate date of birth (minimum age 13)
      const dobValidation = validateDateOfBirth(dateOfBirth, 13, 120);
      if (!dobValidation.valid) {
        errors.dateOfBirth = dobValidation.error!;
      }

      // Validate gender
      const genderValidation = validateGender(gender);
      if (!genderValidation.valid) {
        errors.gender = genderValidation.error!;
      }

      // Return all validation errors at once
      if (Object.keys(errors).length > 0) {
        const firstError = Object.entries(errors)[0];
        res.status(400).json(
          errorResponse(
            firstError[1],
            firstError[0] === 'dateOfBirth'
              ? ValidationErrorCodes.DOB_INVALID_FORMAT
              : ValidationErrorCodes.GENDER_INVALID,
            firstError[0],
            errors
          )
        );
        return;
      }

      const result = await registrationService.submitDobGender(
        registrationId,
        dateOfBirth,
        genderValidation.normalized!
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error, path: req.path }, 'Error in submitDobGender');

      const statusCode = error.statusCode || 500;
      let code: string = ValidationErrorCodes.INTERNAL_ERROR;

      if (statusCode === 404) code = ValidationErrorCodes.REGISTRATION_NOT_FOUND;
      else if (statusCode === 410) code = ValidationErrorCodes.REGISTRATION_EXPIRED;
      else if (error.message?.includes('13')) code = ValidationErrorCodes.DOB_MIN_AGE;
      else if (statusCode === 400) code = ValidationErrorCodes.REGISTRATION_STEP_INVALID;

      res.status(statusCode).json(
        errorResponse(error.message || 'Internal server error', code)
      );
    }
  }

  /**
   * Step 5: Create password
   * POST /api/v1/registration/password
   */
  async submitPassword(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, password, confirmPassword } = req.body;

      // Validate registration ID
      const idValidation = validateUUID(registrationId, 'Registration ID');
      if (!idValidation.valid) {
        res.status(400).json(
          errorResponse(
            idValidation.error!,
            ValidationErrorCodes.REGISTRATION_NOT_FOUND,
            'registrationId'
          )
        );
        return;
      }

      // Check passwords match first
      if (password !== confirmPassword) {
        res.status(400).json(
          errorResponse(
            'Passwords do not match',
            ValidationErrorCodes.PASSWORDS_DONT_MATCH,
            'confirmPassword'
          )
        );
        return;
      }

      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        res.status(400).json(
          errorResponse(
            passwordValidation.error!,
            ValidationErrorCodes.PASSWORD_TOO_SHORT,
            'password'
          )
        );
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
        passwordStrength: passwordValidation.strength,
      });
    } catch (error: any) {
      logger.error({ error, path: req.path }, 'Error in submitPassword');

      const statusCode = error.statusCode || 500;
      let code: string = ValidationErrorCodes.INTERNAL_ERROR;

      if (statusCode === 404) code = ValidationErrorCodes.REGISTRATION_NOT_FOUND;
      else if (statusCode === 410) code = ValidationErrorCodes.REGISTRATION_EXPIRED;
      else if (statusCode === 400) code = ValidationErrorCodes.REGISTRATION_STEP_INVALID;

      res.status(statusCode).json(
        errorResponse(error.message || 'Internal server error', code)
      );
    }
  }

  /**
   * Step 6: Submit phone number
   * POST /api/v1/registration/phone
   */
  async submitPhone(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, phoneNum } = req.body;

      // Validate registration ID
      const idValidation = validateUUID(registrationId, 'Registration ID');
      if (!idValidation.valid) {
        res.status(400).json(
          errorResponse(
            idValidation.error!,
            ValidationErrorCodes.REGISTRATION_NOT_FOUND,
            'registrationId'
          )
        );
        return;
      }

      // Validate phone number
      const phoneValidation = validatePhoneNumber(phoneNum);
      if (!phoneValidation.valid) {
        res.status(400).json(
          errorResponse(
            phoneValidation.error!,
            ValidationErrorCodes.PHONE_INVALID_FORMAT,
            'phoneNum'
          )
        );
        return;
      }

      const result = await registrationService.submitPhone(
        registrationId,
        phoneValidation.sanitized!
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error, path: req.path }, 'Error in submitPhone');

      const statusCode = error.statusCode || 500;
      let code: string = ValidationErrorCodes.INTERNAL_ERROR;

      if (statusCode === 404) code = ValidationErrorCodes.REGISTRATION_NOT_FOUND;
      else if (statusCode === 410) code = ValidationErrorCodes.REGISTRATION_EXPIRED;
      else if (statusCode === 409) code = ValidationErrorCodes.PHONE_ALREADY_EXISTS;
      else if (statusCode === 400) code = ValidationErrorCodes.REGISTRATION_STEP_INVALID;

      res.status(statusCode).json(
        errorResponse(error.message || 'Internal server error', code, 'phoneNum')
      );
    }
  }

  /**
   * Step 7: Verify phone OTP (Final step)
   * POST /api/v1/registration/phone/verify
   */
  async verifyPhoneOtp(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId, otp } = req.body;

      // Validate registration ID
      const idValidation = validateUUID(registrationId, 'Registration ID');
      if (!idValidation.valid) {
        res.status(400).json(
          errorResponse(
            idValidation.error!,
            ValidationErrorCodes.REGISTRATION_NOT_FOUND,
            'registrationId'
          )
        );
        return;
      }

      // Validate OTP
      const otpValidation = validateOTP(otp);
      if (!otpValidation.valid) {
        res.status(400).json(
          errorResponse(
            otpValidation.error!,
            ValidationErrorCodes.OTP_INVALID_FORMAT,
            'otp'
          )
        );
        return;
      }

      const result = await registrationService.verifyPhoneOtp(
        registrationId,
        otpValidation.sanitized!
      );

      res.status(200).json({
        success: true,
        message: 'Registration completed successfully',
        ...result,
      });
    } catch (error: any) {
      logger.error({ error, path: req.path }, 'Error in verifyPhoneOtp');

      const statusCode = error.statusCode || 500;
      let code: string = ValidationErrorCodes.INTERNAL_ERROR;

      if (statusCode === 404) code = ValidationErrorCodes.REGISTRATION_NOT_FOUND;
      else if (statusCode === 410) code = ValidationErrorCodes.REGISTRATION_EXPIRED;
      else if (statusCode === 429) code = ValidationErrorCodes.OTP_MAX_ATTEMPTS;
      else if (error.message?.includes('expired')) code = ValidationErrorCodes.OTP_EXPIRED;
      else if (error.message?.includes('Invalid')) code = ValidationErrorCodes.OTP_INVALID;
      else if (error.message?.includes('already')) code = ValidationErrorCodes.REGISTRATION_ALREADY_COMPLETED;

      res.status(statusCode).json(
        errorResponse(error.message || 'Internal server error', code)
      );
    }
  }

  /**
   * Resend phone OTP
   * POST /api/v1/registration/phone/resend
   */
  async resendPhoneOtp(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId } = req.body;

      // Validate registration ID
      const idValidation = validateUUID(registrationId, 'Registration ID');
      if (!idValidation.valid) {
        res.status(400).json(
          errorResponse(
            idValidation.error!,
            ValidationErrorCodes.REGISTRATION_NOT_FOUND,
            'registrationId'
          )
        );
        return;
      }

      const result = await registrationService.resendPhoneOtp(registrationId);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error({ error, path: req.path }, 'Error in resendPhoneOtp');

      const statusCode = error.statusCode || 500;
      const code = statusCode === 404
        ? ValidationErrorCodes.REGISTRATION_NOT_FOUND
        : statusCode === 410
        ? ValidationErrorCodes.REGISTRATION_EXPIRED
        : ValidationErrorCodes.INTERNAL_ERROR;

      res.status(statusCode).json(
        errorResponse(error.message || 'Internal server error', code)
      );
    }
  }

  /**
   * Get registration progress
   * GET /api/v1/registration/:registrationId
   */
  async getRegistrationStatus(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId } = req.params;

      // Validate registration ID
      const idValidation = validateUUID(registrationId, 'Registration ID');
      if (!idValidation.valid) {
        res.status(400).json(
          errorResponse(
            idValidation.error!,
            ValidationErrorCodes.REGISTRATION_NOT_FOUND,
            'registrationId'
          )
        );
        return;
      }

      const result = await registrationService.getRegistrationStatus(registrationId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error({ error, path: req.path }, 'Error in getRegistrationStatus');

      const statusCode = error.statusCode || 500;
      const code = statusCode === 404
        ? ValidationErrorCodes.REGISTRATION_NOT_FOUND
        : statusCode === 410
        ? ValidationErrorCodes.REGISTRATION_EXPIRED
        : ValidationErrorCodes.INTERNAL_ERROR;

      res.status(statusCode).json(
        errorResponse(error.message || 'Internal server error', code)
      );
    }
  }
}

export const registrationController = new RegistrationController();
