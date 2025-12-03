import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import { identityConfig } from '../config';

// Type definitions for registration flow
// These match the Prisma schema enums
type RegistrationStep =
  | 'EMAIL_PENDING'
  | 'EMAIL_SENT'
  | 'EMAIL_VERIFIED'
  | 'NAME_COUNTRY_SET'
  | 'DOB_GENDER_SET'
  | 'PASSWORD_SET'
  | 'PHONE_SENT'
  | 'PHONE_VERIFIED'
  | 'COMPLETED';

type Gender = 'MALE' | 'FEMALE';

/**
 * Test OTP Code
 *
 * During development and testing, use "111111" as the OTP code for both
 * email and phone verification. This allows testing the full registration
 * flow without requiring a real SMS/email provider integration.
 *
 * In production, this should be replaced with:
 * - Email: SendGrid, AWS SES, or similar
 * - SMS: Twilio, AWS SNS, or similar
 */
const TEST_OTP_CODE = '111111';

/**
 * OTP expiration time in minutes
 */
const OTP_EXPIRY_MINUTES = 10;

/**
 * Maximum OTP verification attempts before lockout
 */
const MAX_OTP_ATTEMPTS = 5;

/**
 * Registration expiration time in hours (incomplete registrations are cleaned up)
 */
const REGISTRATION_EXPIRY_HOURS = 24;

/**
 * Genesis eligibility age range (per GX Protocol whitepaper)
 */
const MIN_GENESIS_AGE = 13;
const MAX_GENESIS_AGE = 73;

/**
 * Password validation regex
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

interface RegistrationProgressDTO {
  registrationId: string;
  currentStep: RegistrationStep;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  countryCode?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  phoneNum?: string;
  phoneVerified: boolean;
  createdAt: Date;
  expiresAt: Date;
}

interface LoginResponseDTO {
  accessToken: string;
  refreshToken: string;
  user: {
    profileId: string;
    email: string | null;
    firstName: string;
    lastName: string;
    phoneNum: string | null;
    status: string;
    nationalityCountryCode: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Progressive Registration Service
 *
 * Implements a Wise.com-style registration flow where each step saves
 * to the PendingRegistration table. Upon completing all steps, the data
 * is migrated to UserProfile with REGISTERED status.
 */
class RegistrationService {
  /**
   * Step 1: Submit email address
   *
   * Creates a new PendingRegistration record and sends OTP to email.
   * If email already exists in PendingRegistration (not expired), returns existing record.
   * If email exists in UserProfile, throws error.
   *
   * @param email - User's email address
   * @param ipAddress - Client IP address for fraud detection
   * @param userAgent - Client user agent for device tracking
   * @returns Registration ID and message
   */
  async submitEmail(
    email: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ registrationId: string; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    logger.info({ email: normalizedEmail }, 'Starting email registration');

    // Check if email exists in UserProfile (already registered)
    const existingUser = await db.userProfile.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      logger.warn({ email: normalizedEmail }, 'Email already registered');
      const error: any = new Error('This email is already registered. Please login instead.');
      error.statusCode = 409;
      throw error;
    }

    // Check for existing pending registration (not expired)
    const existingPending = await db.pendingRegistration.findFirst({
      where: {
        email: normalizedEmail,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingPending) {
      // If email not verified yet, allow resending OTP
      if (!existingPending.emailVerified) {
        await this.sendEmailOtp(existingPending.id, normalizedEmail);
        return {
          registrationId: existingPending.id,
          message: 'Verification code sent to your email',
        };
      }

      // If email verified, return existing registration to continue
      return {
        registrationId: existingPending.id,
        message: 'Continuing existing registration',
      };
    }

    // Generate OTP hash
    const otpHash = await bcrypt.hash(TEST_OTP_CODE, 10);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + REGISTRATION_EXPIRY_HOURS);

    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    // Create new pending registration
    const registration = await db.pendingRegistration.create({
      data: {
        email: normalizedEmail,
        emailOtpHash: otpHash,
        emailOtpExpiresAt: otpExpiresAt,
        emailOtpAttempts: 0,
        currentStep: 'EMAIL_SENT',
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    logger.info(
      { registrationId: registration.id, email: normalizedEmail },
      'Pending registration created, OTP sent'
    );

    // In production, send actual email here
    // await emailService.sendOtp(normalizedEmail, TEST_OTP_CODE);

    return {
      registrationId: registration.id,
      message: 'Verification code sent to your email',
    };
  }

  /**
   * Step 2: Verify email OTP
   *
   * @param registrationId - UUID of pending registration
   * @param otp - OTP code entered by user
   * @returns Updated registration status
   */
  async verifyEmailOtp(
    registrationId: string,
    otp: string
  ): Promise<{ registrationId: string; currentStep: RegistrationStep; message: string }> {
    logger.info({ registrationId }, 'Verifying email OTP');

    const registration = await this.getValidRegistration(registrationId);

    // Check if already verified
    if (registration.emailVerified) {
      return {
        registrationId,
        currentStep: registration.currentStep,
        message: 'Email already verified',
      };
    }

    // Check OTP attempts
    if (registration.emailOtpAttempts >= MAX_OTP_ATTEMPTS) {
      const error: any = new Error('Maximum verification attempts exceeded. Please restart registration.');
      error.statusCode = 429;
      throw error;
    }

    // Check OTP expiry
    if (!registration.emailOtpExpiresAt || registration.emailOtpExpiresAt < new Date()) {
      const error: any = new Error('Verification code has expired. Please request a new one.');
      error.statusCode = 400;
      throw error;
    }

    // Verify OTP
    const isValid = await bcrypt.compare(otp, registration.emailOtpHash || '');

    if (!isValid) {
      // Increment attempts
      await db.pendingRegistration.update({
        where: { id: registrationId },
        data: { emailOtpAttempts: registration.emailOtpAttempts + 1 },
      });

      logger.warn(
        { registrationId, attempts: registration.emailOtpAttempts + 1 },
        'Invalid email OTP'
      );

      const error: any = new Error('Invalid verification code');
      error.statusCode = 400;
      throw error;
    }

    // Mark email as verified
    const updated = await db.pendingRegistration.update({
      where: { id: registrationId },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        currentStep: 'EMAIL_VERIFIED',
      },
    });

    logger.info({ registrationId }, 'Email verified successfully');

    return {
      registrationId,
      currentStep: updated.currentStep,
      message: 'Email verified successfully',
    };
  }

  /**
   * Resend email OTP
   *
   * @param registrationId - UUID of pending registration
   * @returns Success message
   */
  async resendEmailOtp(registrationId: string): Promise<{ message: string }> {
    const registration = await this.getValidRegistration(registrationId);

    if (registration.emailVerified) {
      const error: any = new Error('Email is already verified');
      error.statusCode = 400;
      throw error;
    }

    await this.sendEmailOtp(registrationId, registration.email);

    return { message: 'Verification code sent to your email' };
  }

  /**
   * Step 3: Submit name and country
   *
   * @param registrationId - UUID of pending registration
   * @param firstName - User's first name
   * @param lastName - User's last name
   * @param countryCode - ISO 3166-1 alpha-2 country code
   * @returns Updated registration status
   */
  async submitNameCountry(
    registrationId: string,
    firstName: string,
    lastName: string,
    countryCode: string
  ): Promise<{ registrationId: string; currentStep: RegistrationStep; message: string }> {
    logger.info({ registrationId }, 'Submitting name and country');

    const registration = await this.getValidRegistration(registrationId);

    // Ensure email is verified
    if (!registration.emailVerified) {
      const error: any = new Error('Please verify your email first');
      error.statusCode = 400;
      throw error;
    }

    // Validate country code
    const country = await db.country.findUnique({
      where: { countryCode: countryCode.toUpperCase() },
    });

    if (!country) {
      const error: any = new Error(`Invalid country code: ${countryCode}`);
      error.statusCode = 400;
      throw error;
    }

    // Update registration
    const updated = await db.pendingRegistration.update({
      where: { id: registrationId },
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        countryCode: countryCode.toUpperCase(),
        currentStep: 'NAME_COUNTRY_SET',
      },
    });

    logger.info({ registrationId }, 'Name and country saved');

    return {
      registrationId,
      currentStep: updated.currentStep,
      message: 'Name and country saved successfully',
    };
  }

  /**
   * Step 4: Submit date of birth and gender
   *
   * @param registrationId - UUID of pending registration
   * @param dateOfBirth - Date of birth (YYYY-MM-DD format)
   * @param gender - 'MALE' or 'FEMALE'
   * @returns Updated registration status with genesis eligibility
   */
  async submitDobGender(
    registrationId: string,
    dateOfBirth: string,
    gender: Gender
  ): Promise<{
    registrationId: string;
    currentStep: RegistrationStep;
    message: string;
    genesisEligible: boolean;
    eligibilityMessage?: string;
  }> {
    logger.info({ registrationId }, 'Submitting DOB and gender');

    const registration = await this.getValidRegistration(registrationId);

    // Ensure previous step completed
    if (!registration.firstName || !registration.countryCode) {
      const error: any = new Error('Please complete the previous step first');
      error.statusCode = 400;
      throw error;
    }

    // Parse and validate date of birth
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) {
      const error: any = new Error('Invalid date of birth format. Expected YYYY-MM-DD');
      error.statusCode = 400;
      throw error;
    }

    // Calculate age
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }

    // Check minimum age (13)
    if (age < MIN_GENESIS_AGE) {
      const error: any = new Error(`You must be at least ${MIN_GENESIS_AGE} years old to register`);
      error.statusCode = 400;
      throw error;
    }

    // Check genesis eligibility (13-73)
    const genesisEligible = age >= MIN_GENESIS_AGE && age <= MAX_GENESIS_AGE;

    // Update registration
    const updated = await db.pendingRegistration.update({
      where: { id: registrationId },
      data: {
        dateOfBirth: dob,
        gender,
        currentStep: 'DOB_GENDER_SET',
      },
    });

    logger.info({ registrationId, age, genesisEligible }, 'DOB and gender saved');

    return {
      registrationId,
      currentStep: updated.currentStep,
      message: 'Date of birth and gender saved successfully',
      genesisEligible,
      eligibilityMessage: genesisEligible
        ? `You are eligible for genesis allocation (age ${age})`
        : `Users over ${MAX_GENESIS_AGE} are not eligible for genesis allocation`,
    };
  }

  /**
   * Step 5: Create password
   *
   * @param registrationId - UUID of pending registration
   * @param password - Password to set
   * @param confirmPassword - Password confirmation
   * @returns Updated registration status
   */
  async submitPassword(
    registrationId: string,
    password: string,
    confirmPassword: string
  ): Promise<{ registrationId: string; currentStep: RegistrationStep; message: string }> {
    logger.info({ registrationId }, 'Setting password');

    const registration = await this.getValidRegistration(registrationId);

    // Ensure previous step completed
    if (!registration.dateOfBirth || !registration.gender) {
      const error: any = new Error('Please complete the previous step first');
      error.statusCode = 400;
      throw error;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      const error: any = new Error('Passwords do not match');
      error.statusCode = 400;
      throw error;
    }

    // Validate password strength
    if (!PASSWORD_REGEX.test(password)) {
      const error: any = new Error(
        'Password must be at least 8 characters and contain uppercase, lowercase, and a number'
      );
      error.statusCode = 400;
      throw error;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update registration
    const updated = await db.pendingRegistration.update({
      where: { id: registrationId },
      data: {
        passwordHash,
        currentStep: 'PASSWORD_SET',
      },
    });

    logger.info({ registrationId }, 'Password set successfully');

    return {
      registrationId,
      currentStep: updated.currentStep,
      message: 'Password created successfully',
    };
  }

  /**
   * Step 6: Submit phone number
   *
   * @param registrationId - UUID of pending registration
   * @param phoneNum - Phone number with country code (e.g., +1234567890)
   * @returns Updated registration status
   */
  async submitPhone(
    registrationId: string,
    phoneNum: string
  ): Promise<{ registrationId: string; currentStep: RegistrationStep; message: string }> {
    logger.info({ registrationId }, 'Submitting phone number');

    const registration = await this.getValidRegistration(registrationId);

    // Ensure password is set
    if (!registration.passwordHash) {
      const error: any = new Error('Please complete the previous step first');
      error.statusCode = 400;
      throw error;
    }

    // Normalize phone number (remove spaces and dashes)
    const normalizedPhone = phoneNum.replace(/[\s-]/g, '');

    // Check if phone already exists in UserProfile
    const existingUser = await db.userProfile.findUnique({
      where: { phoneNum: normalizedPhone },
    });

    if (existingUser) {
      const error: any = new Error('This phone number is already registered');
      error.statusCode = 409;
      throw error;
    }

    // Check if phone exists in another pending registration
    const existingPending = await db.pendingRegistration.findFirst({
      where: {
        phoneNum: normalizedPhone,
        id: { not: registrationId },
        expiresAt: { gt: new Date() },
      },
    });

    if (existingPending) {
      const error: any = new Error('This phone number is already being used in another registration');
      error.statusCode = 409;
      throw error;
    }

    // Generate OTP
    const otpHash = await bcrypt.hash(TEST_OTP_CODE, 10);
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    // Update registration
    const updated = await db.pendingRegistration.update({
      where: { id: registrationId },
      data: {
        phoneNum: normalizedPhone,
        phoneOtpHash: otpHash,
        phoneOtpExpiresAt: otpExpiresAt,
        phoneOtpAttempts: 0,
        currentStep: 'PHONE_SENT',
      },
    });

    logger.info({ registrationId }, 'Phone OTP sent');

    // In production, send actual SMS here
    // await smsService.sendOtp(normalizedPhone, TEST_OTP_CODE);

    return {
      registrationId,
      currentStep: updated.currentStep,
      message: 'Verification code sent to your phone',
    };
  }

  /**
   * Step 7: Verify phone OTP (Final step)
   *
   * Upon successful verification:
   * - Migrates PendingRegistration to UserProfile
   * - Generates JWT tokens
   * - Returns user profile with REGISTERED status
   *
   * @param registrationId - UUID of pending registration
   * @param otp - OTP code entered by user
   * @returns JWT tokens and user profile
   */
  async verifyPhoneOtp(
    registrationId: string,
    otp: string
  ): Promise<LoginResponseDTO> {
    logger.info({ registrationId }, 'Verifying phone OTP');

    const registration = await this.getValidRegistration(registrationId);

    // Check if already completed
    if (registration.migratedToProfileId) {
      const error: any = new Error('Registration already completed');
      error.statusCode = 400;
      throw error;
    }

    // Check OTP attempts
    if (registration.phoneOtpAttempts >= MAX_OTP_ATTEMPTS) {
      const error: any = new Error('Maximum verification attempts exceeded. Please restart registration.');
      error.statusCode = 429;
      throw error;
    }

    // Check OTP expiry
    if (!registration.phoneOtpExpiresAt || registration.phoneOtpExpiresAt < new Date()) {
      const error: any = new Error('Verification code has expired. Please request a new one.');
      error.statusCode = 400;
      throw error;
    }

    // Verify OTP
    const isValid = await bcrypt.compare(otp, registration.phoneOtpHash || '');

    if (!isValid) {
      await db.pendingRegistration.update({
        where: { id: registrationId },
        data: { phoneOtpAttempts: registration.phoneOtpAttempts + 1 },
      });

      logger.warn(
        { registrationId, attempts: registration.phoneOtpAttempts + 1 },
        'Invalid phone OTP'
      );

      const error: any = new Error('Invalid verification code');
      error.statusCode = 400;
      throw error;
    }

    // Mark phone as verified
    await db.pendingRegistration.update({
      where: { id: registrationId },
      data: {
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
        currentStep: 'PHONE_VERIFIED',
      },
    });

    // Migrate to UserProfile
    const user = await this.migrateToUserProfile(registration);

    // Mark registration as completed
    await db.pendingRegistration.update({
      where: { id: registrationId },
      data: {
        migratedToProfileId: user.profileId,
        migratedAt: new Date(),
        currentStep: 'COMPLETED',
      },
    });

    logger.info(
      { registrationId, profileId: user.profileId },
      'Registration completed, user profile created'
    );

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      user: {
        profileId: user.profileId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNum: user.phoneNum,
        status: user.status,
        nationalityCountryCode: user.nationalityCountryCode,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /**
   * Resend phone OTP
   *
   * @param registrationId - UUID of pending registration
   * @returns Success message
   */
  async resendPhoneOtp(registrationId: string): Promise<{ message: string }> {
    const registration = await this.getValidRegistration(registrationId);

    if (!registration.phoneNum) {
      const error: any = new Error('Phone number not yet submitted');
      error.statusCode = 400;
      throw error;
    }

    if (registration.phoneVerified) {
      const error: any = new Error('Phone is already verified');
      error.statusCode = 400;
      throw error;
    }

    // Generate new OTP
    const otpHash = await bcrypt.hash(TEST_OTP_CODE, 10);
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    await db.pendingRegistration.update({
      where: { id: registrationId },
      data: {
        phoneOtpHash: otpHash,
        phoneOtpExpiresAt: otpExpiresAt,
        phoneOtpAttempts: 0,
      },
    });

    logger.info({ registrationId }, 'Phone OTP resent');

    // In production, send actual SMS here
    // await smsService.sendOtp(registration.phoneNum, TEST_OTP_CODE);

    return { message: 'Verification code sent to your phone' };
  }

  /**
   * Get registration progress
   *
   * @param registrationId - UUID of pending registration
   * @returns Registration progress DTO (excluding sensitive data)
   */
  async getRegistrationStatus(registrationId: string): Promise<RegistrationProgressDTO> {
    const registration = await this.getValidRegistration(registrationId);

    return {
      registrationId: registration.id,
      currentStep: registration.currentStep,
      email: registration.email,
      emailVerified: registration.emailVerified,
      firstName: registration.firstName || undefined,
      lastName: registration.lastName || undefined,
      countryCode: registration.countryCode || undefined,
      dateOfBirth: registration.dateOfBirth || undefined,
      gender: registration.gender || undefined,
      phoneNum: registration.phoneNum || undefined,
      phoneVerified: registration.phoneVerified,
      createdAt: registration.createdAt,
      expiresAt: registration.expiresAt,
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Get valid (non-expired) pending registration
   */
  private async getValidRegistration(registrationId: string) {
    const registration = await db.pendingRegistration.findUnique({
      where: { id: registrationId },
    });

    if (!registration) {
      const error: any = new Error('Registration not found');
      error.statusCode = 404;
      throw error;
    }

    if (registration.expiresAt < new Date()) {
      const error: any = new Error('Registration has expired. Please start again.');
      error.statusCode = 410;
      throw error;
    }

    return registration;
  }

  /**
   * Send email OTP (update existing registration)
   */
  private async sendEmailOtp(registrationId: string, email: string): Promise<void> {
    const otpHash = await bcrypt.hash(TEST_OTP_CODE, 10);
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    await db.pendingRegistration.update({
      where: { id: registrationId },
      data: {
        emailOtpHash: otpHash,
        emailOtpExpiresAt: otpExpiresAt,
        emailOtpAttempts: 0,
        currentStep: 'EMAIL_SENT',
      },
    });

    logger.info({ registrationId, email }, 'Email OTP sent');

    // In production, send actual email here
    // await emailService.sendOtp(email, TEST_OTP_CODE);
  }

  /**
   * Migrate PendingRegistration to UserProfile
   *
   * Note: This creates a UserProfile with status REGISTERED.
   * The user still needs to complete KYC and get admin approval before
   * being registered on the blockchain via the batch approval process.
   */
  private async migrateToUserProfile(registration: any) {
    // Generate placeholder biometric hash (will be replaced with actual biometric in KYC)
    const biometricPlaceholder = await bcrypt.hash(
      `${registration.email}:${Date.now()}`,
      10
    );

    // Create user profile (NOT yet on blockchain - that happens after admin approval)
    const user = await db.userProfile.create({
      data: {
        tenantId: 'default',
        email: registration.email,
        passwordHash: registration.passwordHash,
        biometricHash: biometricPlaceholder,
        firstName: registration.firstName,
        lastName: registration.lastName,
        dateOfBirth: registration.dateOfBirth,
        gender: registration.gender?.toLowerCase(),
        phoneNum: registration.phoneNum,
        nationalityCountryCode: registration.countryCode,
        status: 'REGISTERED',
        onchainStatus: 'NOT_REGISTERED',
        isLocked: false,
      },
    });

    return user;
  }

  /**
   * Generate JWT access token
   */
  private generateAccessToken(user: any): string {
    const payload = {
      profileId: user.profileId,
      email: user.email,
      status: user.status,
    };

    const options: any = {
      expiresIn: identityConfig.jwtExpiresIn,
      issuer: 'gx-identity-service',
      audience: 'gx-api',
    };

    return jwt.sign(payload, identityConfig.jwtSecret, options);
  }

  /**
   * Generate JWT refresh token
   */
  private generateRefreshToken(user: any): string {
    const payload = {
      profileId: user.profileId,
      email: user.email,
      status: user.status,
    };

    const options: any = {
      expiresIn: identityConfig.jwtRefreshExpiresIn,
      issuer: 'gx-identity-service',
      audience: 'gx-api-refresh',
    };

    return jwt.sign(payload, identityConfig.jwtSecret, options);
  }
}

export const registrationService = new RegistrationService();
