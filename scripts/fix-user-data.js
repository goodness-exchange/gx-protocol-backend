/**
 * User Data Fix Script
 *
 * This script fixes common data issues that can cause blockchain registration failures:
 * 1. Converts bcrypt biometricHash to SHA-256 format
 * 2. Resets failed CREATE_USER commands for retry
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/fix-user-data.js
 *
 * Or via kubectl:
 *   kubectl exec -n backend-<env> postgres-0 -- psql -U gx_admin -d gx_protocol -f /path/to/fix-user-data.sql
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

async function main() {
  const db = new PrismaClient();

  try {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║           User Data Fix Script                           ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // Step 1: Fix bcrypt biometricHash values
    console.log('=== Step 1: Fixing bcrypt biometricHash values ===\n');

    const usersWithBcrypt = await db.userProfile.findMany({
      where: {
        biometricHash: { startsWith: '$2b$' }
      },
      select: {
        profileId: true,
        email: true,
        biometricHash: true,
      }
    });

    console.log(`Found ${usersWithBcrypt.length} users with bcrypt biometricHash\n`);

    let fixedCount = 0;
    for (const user of usersWithBcrypt) {
      // Generate proper SHA-256 hash
      const newBiometricHash = crypto.createHash('sha256')
        .update(`${user.email}:fixed:${Date.now()}:${Math.random()}`)
        .digest('hex');

      await db.userProfile.update({
        where: { profileId: user.profileId },
        data: { biometricHash: newBiometricHash }
      });

      console.log(`✓ Fixed: ${user.email}`);
      console.log(`  Old: ${user.biometricHash.substring(0, 20)}... (bcrypt)`);
      console.log(`  New: ${newBiometricHash.substring(0, 20)}... (SHA-256)\n`);
      fixedCount++;
    }

    if (fixedCount === 0) {
      console.log('✓ No users need biometricHash fix\n');
    } else {
      console.log(`✓ Fixed ${fixedCount} users\n`);
    }

    // Step 2: Reset failed CREATE_USER commands
    console.log('=== Step 2: Resetting failed CREATE_USER commands ===\n');

    const failedCommands = await db.outboxCommand.findMany({
      where: {
        commandType: 'CREATE_USER',
        status: 'FAILED',
      }
    });

    console.log(`Found ${failedCommands.length} failed CREATE_USER commands\n`);

    let resetCount = 0;
    for (const cmd of failedCommands) {
      // Get the user to get the new biometricHash
      const user = await db.userProfile.findUnique({
        where: { profileId: cmd.requestId },
        select: {
          email: true,
          biometricHash: true,
          dateOfBirth: true,
          nationalityCountryCode: true,
        }
      });

      if (!user) {
        console.log(`⚠ Skipping command ${cmd.id} - user not found`);
        continue;
      }

      // Calculate age from dateOfBirth
      const age = user.dateOfBirth
        ? Math.floor((Date.now() - new Date(user.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : 30; // Default age if not set

      // Update the payload with correct fields
      const payload = {
        userId: cmd.requestId,
        biometricHash: user.biometricHash,
        countryCode: user.nationalityCountryCode || 'US',
        age: age,
      };

      // Reset the command status to PENDING
      await db.outboxCommand.update({
        where: { id: cmd.id },
        data: {
          payload: payload,
          status: 'PENDING',
          attempts: 0,
          error: null,
          errorCode: null,
        }
      });

      console.log(`✓ Reset command for: ${user.email}`);
      console.log(`  Payload: userId=${cmd.requestId.substring(0,8)}..., age=${age}, country=${payload.countryCode}\n`);
      resetCount++;
    }

    if (resetCount === 0) {
      console.log('✓ No commands need reset\n');
    } else {
      console.log(`✓ Reset ${resetCount} commands - they will be retried by outbox-submitter\n`);
    }

    // Step 3: Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                        SUMMARY                            ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Users with biometricHash fixed: ${fixedCount}`);
    console.log(`  CREATE_USER commands reset:     ${resetCount}`);
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
