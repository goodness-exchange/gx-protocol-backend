/**
 * Fabric User ID Generator
 *
 * Generates deterministic 20-character IDs that encode:
 * - Country code (2 chars)
 * - Checksum (3 chars, SHA-1 based)
 * - Date of birth + gender encoded (6 chars: 3 letters + 3 digits)
 * - Account type + random (5 chars: 1 hex + 4 letters)
 * - Random suffix (4 digits)
 *
 * Format: CC CCC AANNNN TCCCC NNNN
 * Example: US A3F HBF934 0ABCD 1234
 */

import crypto from 'crypto';

// Constants
const BASE_DATE = new Date('1900-01-01');
const GENDER_OFFSET = 500000; // Offset for female individuals
const ORG_OFFSET = 1000000; // Offset for organizations

// Account type mapping (hex character 0-F)
export const ACCOUNT_TYPES: Record<string, string> = {
  '0': 'Individuals',
  '1': 'For-profit Businesses',
  '2': 'Not-for-profit Organizations',
  '3': 'Educational Institutions',
  '4': 'Healthcare Providers',
  '5': 'Financial Institutions',
  '6': 'Government Treasury Accounts',
  '7': 'Governmental Accounts (Ministries, Departments, etc.)',
  '8': 'Intergovernmental Organizations (IGOs)',
  '9': 'Diplomatic Missions',
  'A': 'Trusts and Estates',
  'B': 'Reserved',
  'C': 'Reserved',
  'D': 'Reserved',
  'E': 'Reserved for Temporary/Special Purpose Entities',
  'F': 'System Accounts',
};

/**
 * Compute SHA-1 based checksum for DOB block
 */
function computeChecksum(dobBlock: string): string {
  const hash = crypto.createHash('sha1').update(dobBlock).digest('hex');
  return hash.slice(0, 3).toUpperCase();
}

/**
 * Encode date of birth and gender into 6-character block (3 letters + 3 digits)
 *
 * @param dob - Date of birth in YYYY-MM-DD format
 * @param gender - "male", "female", or "system-assigned" for organizations
 * @param isOrganization - Whether this is an organization account
 * @returns 6-character encoded string (e.g., "HBF934")
 */
function encodeDobGender(
  dob: string,
  gender: string,
  isOrganization: boolean = false
): string {
  const dobDate = new Date(dob);

  // Calculate day offset from BASE_DATE
  let offset = Math.floor(
    (dobDate.getTime() - BASE_DATE.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Apply gender/organization offset
  if (isOrganization) {
    offset += ORG_OFFSET;
  } else if (gender.toLowerCase() === 'female') {
    offset += GENDER_OFFSET;
  }

  // Encode offset into 3 letters + 3 digits
  const aaaIndex = Math.floor(offset / 1000);
  const nnn = offset % 1000;

  // Convert aaaIndex to 3 letters (base-26)
  const l1 = String.fromCharCode(65 + Math.floor(aaaIndex / (26 * 26)) % 26);
  const l2 = String.fromCharCode(65 + Math.floor(aaaIndex / 26) % 26);
  const l3 = String.fromCharCode(65 + (aaaIndex % 26));

  return `${l1}${l2}${l3}${nnn.toString().padStart(3, '0')}`;
}

/**
 * Generate unique 20-character Fabric User ID
 *
 * @param countryCode - 2-letter ISO 3166-1 alpha-2 country code (e.g., "US")
 * @param dob - Date of birth/founding in YYYY-MM-DD format
 * @param gender - "male", "female", or "system-assigned" for organizations
 * @param accountType - Single hex character ('0'-'F')
 * @returns 20-character ID with format: CC CCC AANNNN TCCCC NNNN
 *
 * @example
 * generateFabricUserId("US", "1989-05-15", "female", "0")
 * // Returns: "US A3F HBF934 0XYZW 1234"
 */
export function generateFabricUserId(
  countryCode: string,
  dob: string,
  gender: string,
  accountType: string
): string {
  // Validation
  if (!countryCode || countryCode.length !== 2) {
    throw new Error('Country code must be 2 characters (ISO 3166-1 alpha-2)');
  }

  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    throw new Error('Date of birth must be in YYYY-MM-DD format');
  }

  const dobDate = new Date(dob);
  if (isNaN(dobDate.getTime())) {
    throw new Error('Invalid date of birth');
  }

  // Check date range (1900-01-01 to ~3600 years from 1900)
  if (dobDate < BASE_DATE || dobDate > new Date('4000-01-01')) {
    throw new Error('Date of birth must be between 1900-01-01 and 4000-01-01');
  }

  const normalizedGender = gender.toLowerCase();
  if (!['male', 'female', 'system-assigned'].includes(normalizedGender)) {
    throw new Error('Gender must be "male", "female", or "system-assigned"');
  }

  if (!ACCOUNT_TYPES[accountType]) {
    throw new Error(
      `Invalid account type: '${accountType}'. Must be 0-9 or A-F.`
    );
  }

  // Determine if organization
  const isOrg = accountType !== '0';

  // Encode DOB + gender
  const dobBlock = encodeDobGender(dob, normalizedGender, isOrg);

  // Compute checksum
  const checksum = computeChecksum(dobBlock);

  // Generate random components
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';

  const cccc = Array.from(
    { length: 4 },
    () => letters[Math.floor(Math.random() * 26)]
  ).join('');

  const nnnn = Array.from(
    { length: 4 },
    () => digits[Math.floor(Math.random() * 10)]
  ).join('');

  // Format: CC CCC AANNNN TCCCC NNNN
  return `${countryCode.toUpperCase()} ${checksum} ${dobBlock} ${accountType.toUpperCase()}${cccc} ${nnnn}`;
}

/**
 * Decoded Fabric User ID information
 */
export interface DecodedFabricUserId {
  countryCode: string;
  checksum: string;
  dateOfBirth: string;
  gender: string;
  isOrganization: boolean;
  accountTypeCode: string;
  accountTypeName: string;
  uniqueSuffix: string;
}

/**
 * Decode a 20-character Fabric User ID to extract embedded information
 *
 * @param uid - The unique ID string
 * @returns Decoded information
 *
 * @example
 * decodeFabricUserId("US A3F HBF934 0XYZW 1234")
 * // Returns: {
 * //   countryCode: "US",
 * //   dateOfBirth: "1989-05-15",
 * //   gender: "female",
 * //   ...
 * // }
 */
export function decodeFabricUserId(uid: string): DecodedFabricUserId {
  // Split by spaces
  const parts = uid.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(
      `Invalid ID format. Expected 5 space-separated blocks, got ${parts.length}`
    );
  }

  const [country, checksum, dobBlock, tcccc, nnnn] = parts;

  // Validate block lengths
  if (country.length !== 2) {
    throw new Error('Country code must be 2 characters');
  }
  if (checksum.length !== 3) {
    throw new Error('Checksum must be 3 characters');
  }
  if (dobBlock.length !== 6) {
    throw new Error('DOB block must be 6 characters');
  }
  if (tcccc.length !== 5) {
    throw new Error('Account type block must be 5 characters');
  }
  if (nnnn.length !== 4) {
    throw new Error('Random suffix must be 4 characters');
  }

  // Decode DOB block (3 letters + 3 digits)
  const [l1, l2, l3] = dobBlock
    .slice(0, 3)
    .split('')
    .map((c) => c.charCodeAt(0) - 65);

  if (l1 < 0 || l1 > 25 || l2 < 0 || l2 > 25 || l3 < 0 || l3 > 25) {
    throw new Error('Invalid DOB block encoding');
  }

  const aaaIndex = l1 * 26 * 26 + l2 * 26 + l3;
  let offset = aaaIndex * 1000 + parseInt(dobBlock.slice(3), 10);

  // Determine type and gender
  let type: 'individual' | 'organization' = 'individual';
  let gender = 'male';

  if (offset >= ORG_OFFSET) {
    offset -= ORG_OFFSET;
    type = 'organization';
    gender = 'system-assigned';
  } else if (offset >= GENDER_OFFSET) {
    offset -= GENDER_OFFSET;
    gender = 'female';
  }

  // Calculate DOB
  const dob = new Date(BASE_DATE.getTime() + offset * 24 * 60 * 60 * 1000);

  // Extract account type
  const accountTypeHex = tcccc[0].toUpperCase();

  return {
    countryCode: country,
    checksum,
    dateOfBirth: dob.toISOString().slice(0, 10),
    gender,
    isOrganization: type === 'organization',
    accountTypeCode: accountTypeHex,
    accountTypeName: ACCOUNT_TYPES[accountTypeHex] || 'Unknown',
    uniqueSuffix: `${tcccc.slice(1)}${nnnn}`,
  };
}

/**
 * Validate Fabric User ID format and checksum
 *
 * @param uid - The unique ID string to validate
 * @returns true if valid, false otherwise
 */
export function validateFabricUserId(uid: string): boolean {
  try {
    const parts = uid.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    const [, checksum, dobBlock] = parts;

    // Verify checksum
    const computedChecksum = computeChecksum(dobBlock);
    if (checksum !== computedChecksum) return false;

    // Try to decode (will throw if invalid)
    decodeFabricUserId(uid);

    return true;
  } catch {
    return false;
  }
}
