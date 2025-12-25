/**
 * Test User Setup Script
 *
 * Creates standardized test users for any environment with:
 * - Proper SHA-256 biometricHash (blockchain compatible)
 * - Consistent test data
 * - Wallets with balances
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." ENVIRONMENT=devnet node scripts/setup-test-users.js
 *
 * Environment variables:
 *   DATABASE_URL  - PostgreSQL connection string
 *   ENVIRONMENT   - devnet, testnet, or mainnet (affects email domain)
 *   SKIP_EXISTING - Set to "true" to skip if users exist
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ENVIRONMENT = process.env.ENVIRONMENT || 'devnet';
const SKIP_EXISTING = process.env.SKIP_EXISTING === 'true';
const PASSWORD = 'TestPass123!';

// Test users with consistent data
const TEST_USERS = [
  { fname: 'Alice', lname: 'Johnson', email: 'alice.johnson', dob: '1990-03-15', gender: 'female', country: 'US', phone: '+12025552001' },
  { fname: 'Robert', lname: 'Williams', email: 'bob.williams', dob: '1985-07-22', gender: 'male', country: 'GB', phone: '+442071234568' },
  { fname: 'Charles', lname: 'Adeyemi', email: 'charlie.adeyemi', dob: '1992-11-08', gender: 'male', country: 'NG', phone: '+2348012345678' },
  { fname: 'Diana', lname: 'Mueller', email: 'diana.mueller', dob: '1988-04-20', gender: 'female', country: 'DE', phone: '+4915112345678' },
  { fname: 'Eve', lname: 'Tanaka', email: 'eve.tanaka', dob: '1995-09-12', gender: 'female', country: 'JP', phone: '+819012345678' },
  { fname: 'Franklin', lname: 'Sharma', email: 'frank.sharma', dob: '1991-06-30', gender: 'male', country: 'IN', phone: '+919876543210' },
  { fname: 'Grace', lname: 'Silva', email: 'grace.silva', dob: '1993-02-14', gender: 'female', country: 'BR', phone: '+5511987654321' },
  { fname: 'Henry', lname: 'Thompson', email: 'henry.thompson', dob: '1987-12-25', gender: 'male', country: 'CA', phone: '+14165551234' },
];

async function main() {
  const db = new PrismaClient();

  try {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║           Test User Setup Script                         ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    console.log(`Environment: ${ENVIRONMENT}`);
    console.log(`Email domain: @${ENVIRONMENT}.gxcoin.test\n`);

    // Hash password once
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    let created = 0;
    let skipped = 0;

    for (const user of TEST_USERS) {
      const email = `${user.email}@${ENVIRONMENT}.gxcoin.test`;

      // Check if user exists
      const existing = await db.userProfile.findUnique({
        where: { email }
      });

      if (existing) {
        if (SKIP_EXISTING) {
          console.log(`⊘ Skipped: ${email} (already exists)`);
          skipped++;
          continue;
        } else {
          // Delete existing to recreate
          await db.userProfile.delete({ where: { email } });
          console.log(`⟳ Deleted existing: ${email}`);
        }
      }

      // Generate SHA-256 biometricHash (blockchain compatible)
      const biometricHash = crypto.createHash('sha256')
        .update(`${email}:${Date.now()}:${Math.random()}`)
        .digest('hex');

      // Create user
      const newUser = await db.userProfile.create({
        data: {
          tenantId: 'default',
          email,
          passwordHash,
          biometricHash,
          firstName: user.fname,
          lastName: user.lname,
          dateOfBirth: new Date(user.dob),
          gender: user.gender,
          phoneNum: user.phone,
          nationalityCountryCode: user.country,
          status: 'REGISTERED',
          onchainStatus: 'NOT_REGISTERED',
          isLocked: false,
        }
      });

      console.log(`✓ Created: ${email}`);
      console.log(`  Profile ID: ${newUser.profileId}`);
      console.log(`  biometricHash: ${biometricHash.substring(0, 20)}... (SHA-256)\n`);
      created++;
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                        SUMMARY                            ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Users created: ${created}`);
    console.log(`  Users skipped: ${skipped}`);
    console.log(`  Password:      ${PASSWORD}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Next steps:');
    console.log('  1. Approve users via admin API or direct DB update');
    console.log('  2. Wait for CREATE_USER commands to process');
    console.log('  3. Create wallets for users who need to transact');
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
