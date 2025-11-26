import { Router } from 'express';
import { registrationController } from '../controllers/registration.controller';
import { strictRateLimiter } from '@gx/core-http';

/**
 * Progressive Registration Routes
 *
 * Implements a Wise.com-style progressive registration flow where each step
 * saves data to the PendingRegistration table. Upon completing all steps,
 * the data is migrated to UserProfile.
 *
 * Registration Flow (7 Steps):
 * - Step 1: Email submission (creates PendingRegistration record)
 * - Step 2: Email OTP verification
 * - Step 3: Name & Country collection
 * - Step 4: Date of Birth & Gender collection
 * - Step 5: Password creation
 * - Step 6: Phone number submission
 * - Step 7: Phone OTP verification (completes registration)
 *
 * Test OTP: During development/testing, use "111111" as the OTP code for both
 * email and phone verification. This allows testing the full registration flow
 * without a real SMS/email provider.
 */

const router = Router();

/**
 * POST /api/v1/registration/email
 * Step 1: Submit email address to start registration
 *
 * Creates a new PendingRegistration record and sends OTP to email.
 * Rate limited: 5 requests per minute per IP (abuse protection)
 *
 * @body { email: string }
 * @returns { registrationId: string, message: string }
 */
router.post('/email', strictRateLimiter, registrationController.submitEmail);

/**
 * POST /api/v1/registration/email/verify
 * Step 2: Verify email OTP
 *
 * Rate limited: 5 requests per minute per IP (brute force protection)
 *
 * @body { registrationId: string, otp: string }
 * @returns { registrationId: string, currentStep: string, message: string }
 */
router.post('/email/verify', strictRateLimiter, registrationController.verifyEmailOtp);

/**
 * POST /api/v1/registration/email/resend
 * Resend email OTP
 *
 * Rate limited: 3 requests per minute per IP
 *
 * @body { registrationId: string }
 * @returns { message: string }
 */
router.post('/email/resend', strictRateLimiter, registrationController.resendEmailOtp);

/**
 * POST /api/v1/registration/name-country
 * Step 3: Submit first name, last name, and country
 *
 * @body { registrationId: string, firstName: string, lastName: string, countryCode: string }
 * @returns { registrationId: string, currentStep: string, message: string }
 */
router.post('/name-country', registrationController.submitNameCountry);

/**
 * POST /api/v1/registration/dob-gender
 * Step 4: Submit date of birth and gender
 *
 * These fields are required for Fabric User ID generation and genesis eligibility check.
 * Users must be between 13-73 years old to be eligible for genesis allocation.
 *
 * @body { registrationId: string, dateOfBirth: string (YYYY-MM-DD), gender: 'MALE' | 'FEMALE' }
 * @returns { registrationId: string, currentStep: string, message: string, genesisEligible: boolean }
 */
router.post('/dob-gender', registrationController.submitDobGender);

/**
 * POST /api/v1/registration/password
 * Step 5: Create password
 *
 * Password requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 *
 * @body { registrationId: string, password: string, confirmPassword: string }
 * @returns { registrationId: string, currentStep: string, message: string }
 */
router.post('/password', registrationController.submitPassword);

/**
 * POST /api/v1/registration/phone
 * Step 6: Submit phone number
 *
 * Sends OTP to the provided phone number.
 * Rate limited: 5 requests per minute per IP (abuse protection)
 *
 * @body { registrationId: string, phoneNum: string }
 * @returns { registrationId: string, currentStep: string, message: string }
 */
router.post('/phone', strictRateLimiter, registrationController.submitPhone);

/**
 * POST /api/v1/registration/phone/verify
 * Step 7: Verify phone OTP (Final step)
 *
 * Upon successful verification:
 * - Migrates PendingRegistration to UserProfile
 * - Generates JWT tokens
 * - Returns user profile with REGISTERED status
 *
 * Rate limited: 5 requests per minute per IP (brute force protection)
 *
 * @body { registrationId: string, otp: string }
 * @returns { accessToken: string, refreshToken: string, user: UserProfile }
 */
router.post('/phone/verify', strictRateLimiter, registrationController.verifyPhoneOtp);

/**
 * POST /api/v1/registration/phone/resend
 * Resend phone OTP
 *
 * Rate limited: 3 requests per minute per IP
 *
 * @body { registrationId: string }
 * @returns { message: string }
 */
router.post('/phone/resend', strictRateLimiter, registrationController.resendPhoneOtp);

/**
 * GET /api/v1/registration/:registrationId
 * Get current registration progress
 *
 * Returns the current step and collected data (excluding sensitive fields).
 *
 * @param registrationId - UUID of the pending registration
 * @returns { registrationId: string, currentStep: string, email: string, ... }
 */
router.get('/:registrationId', registrationController.getRegistrationStatus);

export default router;
