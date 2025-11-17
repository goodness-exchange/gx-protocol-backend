/**
 * System Parameters Seed Data
 *
 * Seeds critical system-wide parameters that control protocol behavior
 * matching chaincode defaults
 *
 * Run: npx tsx db/seeds/02-system-parameters.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const systemParametersData = [
  // ==========================================
  // TRANSACTION FEES
  // ==========================================
  {
    tenantId: 'default',
    paramKey: 'transactionFeeThreshold',
    paramValue: '10000000', // 100 coins in Qirat (100 * 100,000)
    description: 'Minimum transaction amount before fees apply (in Qirat)',
  },
  {
    tenantId: 'default',
    paramKey: 'transactionFeeBps',
    paramValue: '50', // 0.5% (50 basis points)
    description: 'Transaction fee in basis points (1 bps = 0.01%)',
  },

  // ==========================================
  // VELOCITY TAX (HOARDING TAX)
  // ==========================================
  {
    tenantId: 'default',
    paramKey: 'velocityTaxCycleDays',
    paramValue: '360', // 360 days
    description: 'Velocity tax cycle duration in days',
  },
  {
    tenantId: 'default',
    paramKey: 'velocityTaxMinimumBalance',
    paramValue: '10000000', // 100 coins in Qirat
    description: 'Minimum balance threshold for velocity tax eligibility (in Qirat)',
  },
  {
    tenantId: 'default',
    paramKey: 'velocityTaxRate',
    paramValue: '10', // 10% annual hoarding tax
    description: 'Velocity tax rate as percentage',
  },

  // ==========================================
  // GENESIS DISTRIBUTION TIERS
  // ==========================================
  {
    tenantId: 'default',
    paramKey: 'genesisTier1Amount',
    paramValue: '10000000', // 100 coins
    description: 'Genesis distribution amount for Tier 1 users (in Qirat)',
  },
  {
    tenantId: 'default',
    paramKey: 'genesisTier2Amount',
    paramValue: '50000000', // 500 coins
    description: 'Genesis distribution amount for Tier 2 users (in Qirat)',
  },
  {
    tenantId: 'default',
    paramKey: 'genesisTier3Amount',
    paramValue: '100000000', // 1000 coins
    description: 'Genesis distribution amount for Tier 3 users (in Qirat)',
  },

  // ==========================================
  // LOAN POOL PARAMETERS
  // ==========================================
  {
    tenantId: 'default',
    paramKey: 'loanMaximumAmount',
    paramValue: '10000000000', // 100,000 coins in Qirat
    description: 'Maximum loan amount per application (in Qirat)',
  },
  {
    tenantId: 'default',
    paramKey: 'loanMinimumAmount',
    paramValue: '100000', // 1 coin in Qirat
    description: 'Minimum loan amount per application (in Qirat)',
  },
  {
    tenantId: 'default',
    paramKey: 'loanDefaultDurationDays',
    paramValue: '365', // 1 year
    description: 'Default loan repayment period in days',
  },

  // ==========================================
  // GOVERNANCE PARAMETERS
  // ==========================================
  {
    tenantId: 'default',
    paramKey: 'governanceQuorumPercentage',
    paramValue: '51', // 51% quorum required
    description: 'Minimum voter participation required for proposal validity',
  },
  {
    tenantId: 'default',
    paramKey: 'governanceApprovalThreshold',
    paramValue: '66', // 66% approval required
    description: 'Minimum approval percentage for proposal to pass',
  },
  {
    tenantId: 'default',
    paramKey: 'governanceProposalDurationDays',
    paramValue: '14', // 14 days voting period
    description: 'Duration of voting period for proposals',
  },

  // ==========================================
  // SYSTEM POOL IDENTIFIERS
  // ==========================================
  {
    tenantId: 'default',
    paramKey: 'systemPoolGenesis',
    paramValue: 'SYSTEM_GENESIS_POOL',
    description: 'Genesis distribution pool account ID',
  },
  {
    tenantId: 'default',
    paramKey: 'systemPoolTaxCollection',
    paramValue: 'SYSTEM_TAX_COLLECTION_POOL',
    description: 'Tax collection pool account ID',
  },
  {
    tenantId: 'default',
    paramKey: 'systemPoolLoan',
    paramValue: 'SYSTEM_LOAN_POOL',
    description: 'Loan pool account ID',
  },
  {
    tenantId: 'default',
    paramKey: 'systemPoolBurned',
    paramValue: 'SYSTEM_BURNED_POOL',
    description: 'Burned tokens pool account ID',
  },

  // ==========================================
  // CURRENCY PARAMETERS
  // ==========================================
  {
    tenantId: 'default',
    paramKey: 'currencySymbol',
    paramValue: 'GXC',
    description: 'Currency symbol for GX Coin',
  },
  {
    tenantId: 'default',
    paramKey: 'currencyName',
    paramValue: 'GX Coin',
    description: 'Full currency name',
  },
  {
    tenantId: 'default',
    paramKey: 'currencyDecimals',
    paramValue: '5', // 1 coin = 100,000 Qirat
    description: 'Number of decimal places (Qirat precision)',
  },
  {
    tenantId: 'default',
    paramKey: 'totalSupplyCap',
    paramValue: '21000000000000000', // 210 billion coins in Qirat
    description: 'Maximum total supply cap (in Qirat)',
  },

  // ==========================================
  // KYC AND COMPLIANCE
  // ==========================================
  {
    tenantId: 'default',
    paramKey: 'kycRequired',
    paramValue: 'true',
    description: 'Whether KYC verification is required for certain operations',
  },
  {
    tenantId: 'default',
    paramKey: 'kycMaxFileSize',
    paramValue: '10485760', // 10 MB
    description: 'Maximum KYC document file size in bytes',
  },
  {
    tenantId: 'default',
    paramKey: 'kycAllowedMimeTypes',
    paramValue: 'image/jpeg,image/png,application/pdf',
    description: 'Allowed MIME types for KYC documents',
  },

  // ==========================================
  // RATE LIMITING
  // ==========================================
  {
    tenantId: 'default',
    paramKey: 'rateLimitMaxRequests',
    paramValue: '100',
    description: 'Maximum requests per window per user',
  },
  {
    tenantId: 'default',
    paramKey: 'rateLimitWindowMs',
    paramValue: '60000', // 1 minute
    description: 'Rate limit window duration in milliseconds',
  },

  // ==========================================
  // IDEMPOTENCY
  // ==========================================
  {
    tenantId: 'default',
    paramKey: 'idempotencyTTLHours',
    paramValue: '24',
    description: 'Idempotency key time-to-live in hours',
  },

  // ==========================================
  // MULTI-SIG ORGANIZATION PARAMETERS
  // ==========================================
  {
    tenantId: 'default',
    paramKey: 'orgMinimumStakeholders',
    paramValue: '2',
    description: 'Minimum number of stakeholders for multi-sig organization',
  },
  {
    tenantId: 'default',
    paramKey: 'orgMaximumStakeholders',
    paramValue: '20',
    description: 'Maximum number of stakeholders for multi-sig organization',
  },
  {
    tenantId: 'default',
    paramKey: 'orgDefaultThreshold',
    paramValue: '2', // 2 out of N required by default
    description: 'Default signature threshold for organization operations',
  },
];

async function seedSystemParameters() {
  console.log('⚙️  Starting system parameters seed...');

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const param of systemParametersData) {
    try {
      const existing = await prisma.systemParameter.findUnique({
        where: {
          tenantId_paramKey: {
            tenantId: param.tenantId,
            paramKey: param.paramKey,
          },
        },
      });

      if (existing) {
        // Don't update existing parameters (preserve production values)
        skipped++;
        console.log(`⏭️  ${param.paramKey}: ${existing.paramValue} (unchanged)`);
      } else {
        await prisma.systemParameter.create({
          data: {
            tenantId: param.tenantId,
            paramKey: param.paramKey,
            paramValue: param.paramValue,
          },
        });
        inserted++;
        console.log(`✅ ${param.paramKey}: ${param.paramValue} (inserted)`);
      }
    } catch (error) {
      console.error(`❌ Failed to process ${param.paramKey}:`, error);
    }
  }

  console.log(`\n✅ System parameters seeded:`);
  console.log(`   - Inserted: ${inserted}`);
  console.log(`   - Skipped (existing): ${skipped}`);
  console.log(`   - Total parameters: ${systemParametersData.length}`);
}

// Run seed if executed directly
if (require.main === module) {
  seedSystemParameters()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export default seedSystemParameters;
