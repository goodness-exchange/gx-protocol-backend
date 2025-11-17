/**
 * Master Seed Script
 *
 * Runs all seed scripts in sequence
 *
 * Usage:
 *   npm run seed              # Run all seeds
 *   npm run seed:countries    # Run countries only
 *   npm run seed:params       # Run system parameters only
 */

import { PrismaClient } from '@prisma/client';
import seedCountries from './01-countries';
import seedSystemParameters from './02-system-parameters';

const prisma = new PrismaClient();

async function runAllSeeds() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // Seed 1: Countries (required for user profiles)
    console.log('========================================');
    console.log('SEED 1: Countries');
    console.log('========================================');
    await seedCountries();

    console.log('\n========================================');
    console.log('SEED 2: System Parameters');
    console.log('========================================');
    await seedSystemParameters();

    console.log('\n✅ All seeds completed successfully!');
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    throw error;
  }
}

// Run all seeds if executed directly
if (require.main === module) {
  runAllSeeds()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export default runAllSeeds;
