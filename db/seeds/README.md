# Database Seed Scripts

This directory contains seed data scripts for initializing the GX Protocol database with essential reference data and system parameters.

## Scripts

### 01-countries.ts
Seeds all 195 sovereign nations with ISO 3166-1 alpha-2 country codes and regional classifications.

**Data Includes:**
- Country codes (2-letter ISO standard)
- Country names
- Regional groupings (Africa, Asia, Europe, North America, South America, Oceania)

**Total Records:** 195 countries

### 02-system-parameters.ts
Seeds critical system-wide configuration parameters that control protocol behavior.

**Parameter Categories:**
- **Transaction Fees:** Threshold and basis points
- **Velocity Tax:** Cycle duration, minimum balance, tax rate
- **Genesis Distribution:** Tier amounts (100, 500, 1000 coins)
- **Loan Pool:** Maximum/minimum amounts, default duration
- **Governance:** Quorum percentage, approval threshold, voting duration
- **System Pools:** Genesis, Tax, Loan, Burned pool identifiers
- **Currency:** Symbol, name, decimals, total supply cap
- **KYC Compliance:** File size limits, allowed MIME types
- **Rate Limiting:** Max requests, window duration
- **Organization Multi-Sig:** Min/max stakeholders, default threshold

**Total Parameters:** 38 system parameters

## Usage

### Run All Seeds
```bash
npm run seed
```

### Run Individual Seeds
```bash
# Countries only
npm run seed:countries

# System parameters only
npm run seed:params
```

### Run Directly with tsx
```bash
# All seeds
npx tsx db/seeds/index.ts

# Countries
npx tsx db/seeds/01-countries.ts

# System parameters
npx tsx db/seeds/02-system-parameters.ts
```

## Behavior

- **Countries:** Uses `upsert` to insert new countries without modifying existing ones
- **System Parameters:** Only inserts new parameters, preserves existing values in production
- **Idempotent:** Safe to run multiple times without data duplication

## Prerequisites

1. Database must be running (PostgreSQL)
2. Prisma schema must be migrated: `npm run migrate`
3. Environment variables configured (.env file with `DATABASE_URL`)

## Production Deployment

```bash
# Step 1: Run migrations
npm run migrate

# Step 2: Seed reference data
npm run seed

# Step 3: Verify seed success
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Country\";"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"SystemParameter\";"
```

Expected counts:
- Countries: 195
- SystemParameters: 38

## Modifying Seeds

### Adding New Countries
Edit `01-countries.ts` and add entries to `countriesData` array:
```typescript
{ countryCode: 'XX', countryName: 'New Country', region: 'Region' },
```

### Adding New Parameters
Edit `02-system-parameters.ts` and add entries to `systemParametersData` array:
```typescript
{
  tenantId: 'default',
  paramKey: 'newParameter',
  paramValue: 'value',
  description: 'What this parameter controls',
},
```

### Important Notes

1. **Country Codes:** Must be valid ISO 3166-1 alpha-2 codes (2 characters)
2. **System Parameters:** Parameter keys should be descriptive camelCase
3. **Values:** All parameter values are stored as strings (parse as needed)
4. **Tenant ID:** Currently all use 'default', ready for multi-tenancy future

## Troubleshooting

### Connection Error
```
Error: P1001: Can't reach database server
```
**Solution:** Verify PostgreSQL is running and DATABASE_URL is correct

### Unique Constraint Violation
```
Error: P2002: Unique constraint failed
```
**Solution:** This is expected if data already exists. Upsert will preserve existing data.

### Missing Table
```
Error: P2021: Table does not exist
```
**Solution:** Run migrations first: `npm run migrate`

## Development vs Production

### Development
- Seed data can be reset freely
- Test with different parameter values
- Use `npm run migrate:dev` to create/apply migrations

### Production
- Seed once during initial deployment
- System parameters can be updated directly in database
- Countries rarely need updates (new nations are rare)

## Related Documentation

- Prisma Schema: `db/prisma/schema.prisma`
- Migrations: `db/prisma/migrations/`
- System Design: `docs/architecture/DATABASE_SCHEMA.md`

---

**Last Updated:** November 17, 2025
**Maintained By:** GX Protocol Backend Team
