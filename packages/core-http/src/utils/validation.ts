/**
 * Input Validation and Sanitization Utilities
 *
 * Enterprise-grade validation utilities for secure input handling.
 * Implements OWASP best practices for input validation.
 */

/**
 * Email validation with comprehensive checks
 */
export function validateEmail(email: string): { valid: boolean; error?: string; sanitized?: string } {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  // Trim and lowercase
  const sanitized = email.toLowerCase().trim();

  // Check length
  if (sanitized.length < 5 || sanitized.length > 254) {
    return { valid: false, error: 'Email must be between 5 and 254 characters' };
  }

  // RFC 5322 compliant email regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(sanitized)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Check for dangerous characters
  if (sanitized.includes('..') || sanitized.startsWith('.') || sanitized.includes('.@')) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Check domain has valid TLD
  const domain = sanitized.split('@')[1];
  if (!domain || !domain.includes('.') || domain.endsWith('.')) {
    return { valid: false, error: 'Invalid email domain' };
  }

  return { valid: true, sanitized };
}

/**
 * Name validation with sanitization
 */
export function validateName(name: string, fieldName: string = 'Name'): { valid: boolean; error?: string; sanitized?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: `${fieldName} is required` };
  }

  // Trim whitespace
  let sanitized = name.trim();

  // Remove multiple consecutive spaces
  sanitized = sanitized.replace(/\s+/g, ' ');

  // Check length
  if (sanitized.length < 2) {
    return { valid: false, error: `${fieldName} must be at least 2 characters` };
  }

  if (sanitized.length > 50) {
    return { valid: false, error: `${fieldName} must not exceed 50 characters` };
  }

  // Allow only letters, spaces, hyphens, and apostrophes (for names like O'Brien, Mary-Jane)
  const nameRegex = /^[a-zA-ZÀ-ÿ\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]+([-' ][a-zA-ZÀ-ÿ\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]+)*$/;

  if (!nameRegex.test(sanitized)) {
    return { valid: false, error: `${fieldName} contains invalid characters` };
  }

  // Check for potential injection patterns
  if (containsInjectionPatterns(sanitized)) {
    return { valid: false, error: `${fieldName} contains invalid characters` };
  }

  return { valid: true, sanitized };
}

/**
 * Phone number validation with international format support
 */
export function validatePhoneNumber(phone: string): { valid: boolean; error?: string; sanitized?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  // Remove all whitespace, dashes, and parentheses
  let sanitized = phone.replace(/[\s\-\(\)\.]/g, '');

  // Ensure it starts with + or is all digits
  if (!sanitized.startsWith('+') && !/^\d+$/.test(sanitized)) {
    return { valid: false, error: 'Invalid phone number format' };
  }

  // If it starts with +, remove it for length validation
  const digitsOnly = sanitized.startsWith('+') ? sanitized.slice(1) : sanitized;

  // Must be all digits after potential +
  if (!/^\d+$/.test(digitsOnly)) {
    return { valid: false, error: 'Phone number must contain only digits' };
  }

  // International phone numbers are 7-15 digits (E.164 standard)
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    return { valid: false, error: 'Phone number must be between 7 and 15 digits' };
  }

  // First digit cannot be 0 (E.164 requirement for country codes)
  if (digitsOnly.startsWith('0')) {
    return { valid: false, error: 'Phone number cannot start with 0. Include country code (e.g., +1)' };
  }

  // Ensure + prefix for consistency
  sanitized = sanitized.startsWith('+') ? sanitized : `+${sanitized}`;

  return { valid: true, sanitized };
}

/**
 * Password validation with strength requirements
 */
export function validatePassword(password: string): { valid: boolean; error?: string; strength: 'weak' | 'medium' | 'strong' } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required', strength: 'weak' };
  }

  const errors: string[] = [];
  let strength: 'weak' | 'medium' | 'strong' = 'weak';

  // Minimum length
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  // Maximum length (prevent DoS with very long passwords)
  if (password.length > 128) {
    errors.push('Password must not exceed 128 characters');
  }

  // Require uppercase
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Require lowercase
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Require digit
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (errors.length > 0) {
    return { valid: false, error: errors[0], strength: 'weak' };
  }

  // Calculate strength
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
  if (/[A-Z].*[A-Z]/.test(password)) score++; // Multiple uppercase
  if (/\d.*\d/.test(password)) score++; // Multiple digits

  if (score >= 3) {
    strength = 'strong';
  } else if (score >= 1) {
    strength = 'medium';
  }

  return { valid: true, strength };
}

/**
 * Date of birth validation
 */
export function validateDateOfBirth(
  dob: string,
  minAge: number = 13,
  maxAge: number = 120
): { valid: boolean; error?: string; age?: number; date?: Date } {
  if (!dob || typeof dob !== 'string') {
    return { valid: false, error: 'Date of birth is required' };
  }

  // Validate format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dob)) {
    return { valid: false, error: 'Date of birth must be in YYYY-MM-DD format' };
  }

  const date = new Date(dob);

  // Check if valid date
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date' };
  }

  // Validate date components match input (handles invalid dates like 2024-02-31)
  const [year, month, day] = dob.split('-').map(Number);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
    return { valid: false, error: 'Invalid date' };
  }

  // Calculate age
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age--;
  }

  // Check not in future
  if (date > today) {
    return { valid: false, error: 'Date of birth cannot be in the future' };
  }

  // Check minimum age
  if (age < minAge) {
    return { valid: false, error: `You must be at least ${minAge} years old` };
  }

  // Check maximum age (sanity check)
  if (age > maxAge) {
    return { valid: false, error: 'Invalid date of birth' };
  }

  return { valid: true, age, date };
}

/**
 * Gender validation
 */
export function validateGender(gender: string): { valid: boolean; error?: string; normalized?: 'MALE' | 'FEMALE' } {
  if (!gender || typeof gender !== 'string') {
    return { valid: false, error: 'Gender is required' };
  }

  const normalized = gender.toUpperCase().trim();

  if (normalized !== 'MALE' && normalized !== 'FEMALE') {
    return { valid: false, error: 'Gender must be MALE or FEMALE' };
  }

  return { valid: true, normalized: normalized as 'MALE' | 'FEMALE' };
}

/**
 * Country code validation (ISO 3166-1 alpha-2)
 */
export function validateCountryCode(code: string): { valid: boolean; error?: string; normalized?: string } {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Country code is required' };
  }

  const normalized = code.toUpperCase().trim();

  // ISO 3166-1 alpha-2 format
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return { valid: false, error: 'Country code must be a 2-letter ISO code' };
  }

  return { valid: true, normalized };
}

/**
 * UUID validation
 */
export function validateUUID(uuid: string, fieldName: string = 'ID'): { valid: boolean; error?: string } {
  if (!uuid || typeof uuid !== 'string') {
    return { valid: false, error: `${fieldName} is required` };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(uuid)) {
    return { valid: false, error: `Invalid ${fieldName} format` };
  }

  return { valid: true };
}

/**
 * OTP validation
 */
export function validateOTP(otp: string): { valid: boolean; error?: string; sanitized?: string } {
  if (!otp || typeof otp !== 'string') {
    return { valid: false, error: 'Verification code is required' };
  }

  // Remove any whitespace
  const sanitized = otp.replace(/\s/g, '');

  // Must be exactly 6 digits
  if (!/^\d{6}$/.test(sanitized)) {
    return { valid: false, error: 'Verification code must be exactly 6 digits' };
  }

  return { valid: true, sanitized };
}

/**
 * Check for common injection patterns
 */
function containsInjectionPatterns(input: string): boolean {
  const patterns = [
    /<script/i,
    /javascript:/i,
    /on\w+=/i, // onclick, onerror, etc.
    /data:/i,
    /vbscript:/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /\${/,   // Template injection
    /{{/,    // Template injection
    /\$\(/,  // jQuery/shell injection
    /`/,     // Template literals
    /\\/,    // Backslash (escape sequences)
    /;/,     // SQL/command injection
    /--/,    // SQL comment
    /\/\*/,  // SQL/JS comment
    /\|/,    // Pipe (command injection)
    /&/,     // Command chaining
    />/,     // Redirect/XSS
    /</,     // XSS
  ];

  return patterns.some(pattern => pattern.test(input));
}

/**
 * Sanitize string for safe storage (removes potentially dangerous characters)
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/[<>'"\\`;|&$]/g, '') // Remove dangerous characters
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Validation error with field information
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Create standardized validation error
 */
export function createValidationError(field: string, message: string, code: string = 'VALIDATION_ERROR'): ValidationError {
  return { field, message, code };
}

/**
 * Error codes for registration validation
 */
export const ValidationErrorCodes = {
  // Email errors
  EMAIL_REQUIRED: 'EMAIL_REQUIRED',
  EMAIL_INVALID_FORMAT: 'EMAIL_INVALID_FORMAT',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',

  // Name errors
  NAME_REQUIRED: 'NAME_REQUIRED',
  NAME_TOO_SHORT: 'NAME_TOO_SHORT',
  NAME_TOO_LONG: 'NAME_TOO_LONG',
  NAME_INVALID_CHARS: 'NAME_INVALID_CHARS',

  // Phone errors
  PHONE_REQUIRED: 'PHONE_REQUIRED',
  PHONE_INVALID_FORMAT: 'PHONE_INVALID_FORMAT',
  PHONE_ALREADY_EXISTS: 'PHONE_ALREADY_EXISTS',

  // Password errors
  PASSWORD_REQUIRED: 'PASSWORD_REQUIRED',
  PASSWORD_TOO_SHORT: 'PASSWORD_TOO_SHORT',
  PASSWORD_TOO_LONG: 'PASSWORD_TOO_LONG',
  PASSWORD_MISSING_UPPERCASE: 'PASSWORD_MISSING_UPPERCASE',
  PASSWORD_MISSING_LOWERCASE: 'PASSWORD_MISSING_LOWERCASE',
  PASSWORD_MISSING_NUMBER: 'PASSWORD_MISSING_NUMBER',
  PASSWORDS_DONT_MATCH: 'PASSWORDS_DONT_MATCH',

  // DOB errors
  DOB_REQUIRED: 'DOB_REQUIRED',
  DOB_INVALID_FORMAT: 'DOB_INVALID_FORMAT',
  DOB_FUTURE_DATE: 'DOB_FUTURE_DATE',
  DOB_MIN_AGE: 'DOB_MIN_AGE',
  DOB_MAX_AGE: 'DOB_MAX_AGE',

  // Gender errors
  GENDER_REQUIRED: 'GENDER_REQUIRED',
  GENDER_INVALID: 'GENDER_INVALID',

  // Country errors
  COUNTRY_REQUIRED: 'COUNTRY_REQUIRED',
  COUNTRY_INVALID_FORMAT: 'COUNTRY_INVALID_FORMAT',
  COUNTRY_NOT_FOUND: 'COUNTRY_NOT_FOUND',

  // OTP errors
  OTP_REQUIRED: 'OTP_REQUIRED',
  OTP_INVALID_FORMAT: 'OTP_INVALID_FORMAT',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_MAX_ATTEMPTS: 'OTP_MAX_ATTEMPTS',

  // Registration errors
  REGISTRATION_NOT_FOUND: 'REGISTRATION_NOT_FOUND',
  REGISTRATION_EXPIRED: 'REGISTRATION_EXPIRED',
  REGISTRATION_STEP_INVALID: 'REGISTRATION_STEP_INVALID',
  REGISTRATION_ALREADY_COMPLETED: 'REGISTRATION_ALREADY_COMPLETED',

  // General errors
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
