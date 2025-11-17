/**
 * Countries Seed Data
 *
 * Seeds all 195 sovereign nations with ISO 3166-1 alpha-2 codes
 * and regional classifications
 *
 * Run: npx tsx db/seeds/01-countries.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const countriesData = [
  // Africa
  { countryCode: 'DZ', countryName: 'Algeria', region: 'Africa' },
  { countryCode: 'AO', countryName: 'Angola', region: 'Africa' },
  { countryCode: 'BJ', countryName: 'Benin', region: 'Africa' },
  { countryCode: 'BW', countryName: 'Botswana', region: 'Africa' },
  { countryCode: 'BF', countryName: 'Burkina Faso', region: 'Africa' },
  { countryCode: 'BI', countryName: 'Burundi', region: 'Africa' },
  { countryCode: 'CM', countryName: 'Cameroon', region: 'Africa' },
  { countryCode: 'CV', countryName: 'Cape Verde', region: 'Africa' },
  { countryCode: 'CF', countryName: 'Central African Republic', region: 'Africa' },
  { countryCode: 'TD', countryName: 'Chad', region: 'Africa' },
  { countryCode: 'KM', countryName: 'Comoros', region: 'Africa' },
  { countryCode: 'CG', countryName: 'Congo', region: 'Africa' },
  { countryCode: 'CD', countryName: 'Congo, Democratic Republic', region: 'Africa' },
  { countryCode: 'CI', countryName: 'Côte d\'Ivoire', region: 'Africa' },
  { countryCode: 'DJ', countryName: 'Djibouti', region: 'Africa' },
  { countryCode: 'EG', countryName: 'Egypt', region: 'Africa' },
  { countryCode: 'GQ', countryName: 'Equatorial Guinea', region: 'Africa' },
  { countryCode: 'ER', countryName: 'Eritrea', region: 'Africa' },
  { countryCode: 'ET', countryName: 'Ethiopia', region: 'Africa' },
  { countryCode: 'GA', countryName: 'Gabon', region: 'Africa' },
  { countryCode: 'GM', countryName: 'Gambia', region: 'Africa' },
  { countryCode: 'GH', countryName: 'Ghana', region: 'Africa' },
  { countryCode: 'GN', countryName: 'Guinea', region: 'Africa' },
  { countryCode: 'GW', countryName: 'Guinea-Bissau', region: 'Africa' },
  { countryCode: 'KE', countryName: 'Kenya', region: 'Africa' },
  { countryCode: 'LS', countryName: 'Lesotho', region: 'Africa' },
  { countryCode: 'LR', countryName: 'Liberia', region: 'Africa' },
  { countryCode: 'LY', countryName: 'Libya', region: 'Africa' },
  { countryCode: 'MG', countryName: 'Madagascar', region: 'Africa' },
  { countryCode: 'MW', countryName: 'Malawi', region: 'Africa' },
  { countryCode: 'ML', countryName: 'Mali', region: 'Africa' },
  { countryCode: 'MR', countryName: 'Mauritania', region: 'Africa' },
  { countryCode: 'MU', countryName: 'Mauritius', region: 'Africa' },
  { countryCode: 'MA', countryName: 'Morocco', region: 'Africa' },
  { countryCode: 'MZ', countryName: 'Mozambique', region: 'Africa' },
  { countryCode: 'NA', countryName: 'Namibia', region: 'Africa' },
  { countryCode: 'NE', countryName: 'Niger', region: 'Africa' },
  { countryCode: 'NG', countryName: 'Nigeria', region: 'Africa' },
  { countryCode: 'RW', countryName: 'Rwanda', region: 'Africa' },
  { countryCode: 'ST', countryName: 'Sao Tome and Principe', region: 'Africa' },
  { countryCode: 'SN', countryName: 'Senegal', region: 'Africa' },
  { countryCode: 'SC', countryName: 'Seychelles', region: 'Africa' },
  { countryCode: 'SL', countryName: 'Sierra Leone', region: 'Africa' },
  { countryCode: 'SO', countryName: 'Somalia', region: 'Africa' },
  { countryCode: 'ZA', countryName: 'South Africa', region: 'Africa' },
  { countryCode: 'SS', countryName: 'South Sudan', region: 'Africa' },
  { countryCode: 'SD', countryName: 'Sudan', region: 'Africa' },
  { countryCode: 'SZ', countryName: 'Swaziland', region: 'Africa' },
  { countryCode: 'TZ', countryName: 'Tanzania', region: 'Africa' },
  { countryCode: 'TG', countryName: 'Togo', region: 'Africa' },
  { countryCode: 'TN', countryName: 'Tunisia', region: 'Africa' },
  { countryCode: 'UG', countryName: 'Uganda', region: 'Africa' },
  { countryCode: 'ZM', countryName: 'Zambia', region: 'Africa' },
  { countryCode: 'ZW', countryName: 'Zimbabwe', region: 'Africa' },

  // Asia
  { countryCode: 'AF', countryName: 'Afghanistan', region: 'Asia' },
  { countryCode: 'AM', countryName: 'Armenia', region: 'Asia' },
  { countryCode: 'AZ', countryName: 'Azerbaijan', region: 'Asia' },
  { countryCode: 'BH', countryName: 'Bahrain', region: 'Asia' },
  { countryCode: 'BD', countryName: 'Bangladesh', region: 'Asia' },
  { countryCode: 'BT', countryName: 'Bhutan', region: 'Asia' },
  { countryCode: 'BN', countryName: 'Brunei', region: 'Asia' },
  { countryCode: 'KH', countryName: 'Cambodia', region: 'Asia' },
  { countryCode: 'CN', countryName: 'China', region: 'Asia' },
  { countryCode: 'GE', countryName: 'Georgia', region: 'Asia' },
  { countryCode: 'IN', countryName: 'India', region: 'Asia' },
  { countryCode: 'ID', countryName: 'Indonesia', region: 'Asia' },
  { countryCode: 'IR', countryName: 'Iran', region: 'Asia' },
  { countryCode: 'IQ', countryName: 'Iraq', region: 'Asia' },
  { countryCode: 'IL', countryName: 'Israel', region: 'Asia' },
  { countryCode: 'JP', countryName: 'Japan', region: 'Asia' },
  { countryCode: 'JO', countryName: 'Jordan', region: 'Asia' },
  { countryCode: 'KZ', countryName: 'Kazakhstan', region: 'Asia' },
  { countryCode: 'KW', countryName: 'Kuwait', region: 'Asia' },
  { countryCode: 'KG', countryName: 'Kyrgyzstan', region: 'Asia' },
  { countryCode: 'LA', countryName: 'Laos', region: 'Asia' },
  { countryCode: 'LB', countryName: 'Lebanon', region: 'Asia' },
  { countryCode: 'MY', countryName: 'Malaysia', region: 'Asia' },
  { countryCode: 'MV', countryName: 'Maldives', region: 'Asia' },
  { countryCode: 'MN', countryName: 'Mongolia', region: 'Asia' },
  { countryCode: 'MM', countryName: 'Myanmar', region: 'Asia' },
  { countryCode: 'NP', countryName: 'Nepal', region: 'Asia' },
  { countryCode: 'KP', countryName: 'North Korea', region: 'Asia' },
  { countryCode: 'OM', countryName: 'Oman', region: 'Asia' },
  { countryCode: 'PK', countryName: 'Pakistan', region: 'Asia' },
  { countryCode: 'PS', countryName: 'Palestine', region: 'Asia' },
  { countryCode: 'PH', countryName: 'Philippines', region: 'Asia' },
  { countryCode: 'QA', countryName: 'Qatar', region: 'Asia' },
  { countryCode: 'SA', countryName: 'Saudi Arabia', region: 'Asia' },
  { countryCode: 'SG', countryName: 'Singapore', region: 'Asia' },
  { countryCode: 'KR', countryName: 'South Korea', region: 'Asia' },
  { countryCode: 'LK', countryName: 'Sri Lanka', region: 'Asia' },
  { countryCode: 'SY', countryName: 'Syria', region: 'Asia' },
  { countryCode: 'TW', countryName: 'Taiwan', region: 'Asia' },
  { countryCode: 'TJ', countryName: 'Tajikistan', region: 'Asia' },
  { countryCode: 'TH', countryName: 'Thailand', region: 'Asia' },
  { countryCode: 'TL', countryName: 'Timor-Leste', region: 'Asia' },
  { countryCode: 'TR', countryName: 'Turkey', region: 'Asia' },
  { countryCode: 'TM', countryName: 'Turkmenistan', region: 'Asia' },
  { countryCode: 'AE', countryName: 'United Arab Emirates', region: 'Asia' },
  { countryCode: 'UZ', countryName: 'Uzbekistan', region: 'Asia' },
  { countryCode: 'VN', countryName: 'Vietnam', region: 'Asia' },
  { countryCode: 'YE', countryName: 'Yemen', region: 'Asia' },

  // Europe
  { countryCode: 'AL', countryName: 'Albania', region: 'Europe' },
  { countryCode: 'AD', countryName: 'Andorra', region: 'Europe' },
  { countryCode: 'AT', countryName: 'Austria', region: 'Europe' },
  { countryCode: 'BY', countryName: 'Belarus', region: 'Europe' },
  { countryCode: 'BE', countryName: 'Belgium', region: 'Europe' },
  { countryCode: 'BA', countryName: 'Bosnia and Herzegovina', region: 'Europe' },
  { countryCode: 'BG', countryName: 'Bulgaria', region: 'Europe' },
  { countryCode: 'HR', countryName: 'Croatia', region: 'Europe' },
  { countryCode: 'CY', countryName: 'Cyprus', region: 'Europe' },
  { countryCode: 'CZ', countryName: 'Czech Republic', region: 'Europe' },
  { countryCode: 'DK', countryName: 'Denmark', region: 'Europe' },
  { countryCode: 'EE', countryName: 'Estonia', region: 'Europe' },
  { countryCode: 'FI', countryName: 'Finland', region: 'Europe' },
  { countryCode: 'FR', countryName: 'France', region: 'Europe' },
  { countryCode: 'DE', countryName: 'Germany', region: 'Europe' },
  { countryCode: 'GR', countryName: 'Greece', region: 'Europe' },
  { countryCode: 'HU', countryName: 'Hungary', region: 'Europe' },
  { countryCode: 'IS', countryName: 'Iceland', region: 'Europe' },
  { countryCode: 'IE', countryName: 'Ireland', region: 'Europe' },
  { countryCode: 'IT', countryName: 'Italy', region: 'Europe' },
  { countryCode: 'XK', countryName: 'Kosovo', region: 'Europe' },
  { countryCode: 'LV', countryName: 'Latvia', region: 'Europe' },
  { countryCode: 'LI', countryName: 'Liechtenstein', region: 'Europe' },
  { countryCode: 'LT', countryName: 'Lithuania', region: 'Europe' },
  { countryCode: 'LU', countryName: 'Luxembourg', region: 'Europe' },
  { countryCode: 'MK', countryName: 'Macedonia', region: 'Europe' },
  { countryCode: 'MT', countryName: 'Malta', region: 'Europe' },
  { countryCode: 'MD', countryName: 'Moldova', region: 'Europe' },
  { countryCode: 'MC', countryName: 'Monaco', region: 'Europe' },
  { countryCode: 'ME', countryName: 'Montenegro', region: 'Europe' },
  { countryCode: 'NL', countryName: 'Netherlands', region: 'Europe' },
  { countryCode: 'NO', countryName: 'Norway', region: 'Europe' },
  { countryCode: 'PL', countryName: 'Poland', region: 'Europe' },
  { countryCode: 'PT', countryName: 'Portugal', region: 'Europe' },
  { countryCode: 'RO', countryName: 'Romania', region: 'Europe' },
  { countryCode: 'RU', countryName: 'Russia', region: 'Europe' },
  { countryCode: 'SM', countryName: 'San Marino', region: 'Europe' },
  { countryCode: 'RS', countryName: 'Serbia', region: 'Europe' },
  { countryCode: 'SK', countryName: 'Slovakia', region: 'Europe' },
  { countryCode: 'SI', countryName: 'Slovenia', region: 'Europe' },
  { countryCode: 'ES', countryName: 'Spain', region: 'Europe' },
  { countryCode: 'SE', countryName: 'Sweden', region: 'Europe' },
  { countryCode: 'CH', countryName: 'Switzerland', region: 'Europe' },
  { countryCode: 'UA', countryName: 'Ukraine', region: 'Europe' },
  { countryCode: 'GB', countryName: 'United Kingdom', region: 'Europe' },
  { countryCode: 'VA', countryName: 'Vatican City', region: 'Europe' },

  // North America
  { countryCode: 'AG', countryName: 'Antigua and Barbuda', region: 'North America' },
  { countryCode: 'BS', countryName: 'Bahamas', region: 'North America' },
  { countryCode: 'BB', countryName: 'Barbados', region: 'North America' },
  { countryCode: 'BZ', countryName: 'Belize', region: 'North America' },
  { countryCode: 'CA', countryName: 'Canada', region: 'North America' },
  { countryCode: 'CR', countryName: 'Costa Rica', region: 'North America' },
  { countryCode: 'CU', countryName: 'Cuba', region: 'North America' },
  { countryCode: 'DM', countryName: 'Dominica', region: 'North America' },
  { countryCode: 'DO', countryName: 'Dominican Republic', region: 'North America' },
  { countryCode: 'SV', countryName: 'El Salvador', region: 'North America' },
  { countryCode: 'GD', countryName: 'Grenada', region: 'North America' },
  { countryCode: 'GT', countryName: 'Guatemala', region: 'North America' },
  { countryCode: 'HT', countryName: 'Haiti', region: 'North America' },
  { countryCode: 'HN', countryName: 'Honduras', region: 'North America' },
  { countryCode: 'JM', countryName: 'Jamaica', region: 'North America' },
  { countryCode: 'MX', countryName: 'Mexico', region: 'North America' },
  { countryCode: 'NI', countryName: 'Nicaragua', region: 'North America' },
  { countryCode: 'PA', countryName: 'Panama', region: 'North America' },
  { countryCode: 'KN', countryName: 'Saint Kitts and Nevis', region: 'North America' },
  { countryCode: 'LC', countryName: 'Saint Lucia', region: 'North America' },
  { countryCode: 'VC', countryName: 'Saint Vincent and the Grenadines', region: 'North America' },
  { countryCode: 'TT', countryName: 'Trinidad and Tobago', region: 'North America' },
  { countryCode: 'US', countryName: 'United States', region: 'North America' },

  // South America
  { countryCode: 'AR', countryName: 'Argentina', region: 'South America' },
  { countryCode: 'BO', countryName: 'Bolivia', region: 'South America' },
  { countryCode: 'BR', countryName: 'Brazil', region: 'South America' },
  { countryCode: 'CL', countryName: 'Chile', region: 'South America' },
  { countryCode: 'CO', countryName: 'Colombia', region: 'South America' },
  { countryCode: 'EC', countryName: 'Ecuador', region: 'South America' },
  { countryCode: 'GY', countryName: 'Guyana', region: 'South America' },
  { countryCode: 'PY', countryName: 'Paraguay', region: 'South America' },
  { countryCode: 'PE', countryName: 'Peru', region: 'South America' },
  { countryCode: 'SR', countryName: 'Suriname', region: 'South America' },
  { countryCode: 'UY', countryName: 'Uruguay', region: 'South America' },
  { countryCode: 'VE', countryName: 'Venezuela', region: 'South America' },

  // Oceania
  { countryCode: 'AU', countryName: 'Australia', region: 'Oceania' },
  { countryCode: 'FJ', countryName: 'Fiji', region: 'Oceania' },
  { countryCode: 'KI', countryName: 'Kiribati', region: 'Oceania' },
  { countryCode: 'MH', countryName: 'Marshall Islands', region: 'Oceania' },
  { countryCode: 'FM', countryName: 'Micronesia', region: 'Oceania' },
  { countryCode: 'NR', countryName: 'Nauru', region: 'Oceania' },
  { countryCode: 'NZ', countryName: 'New Zealand', region: 'Oceania' },
  { countryCode: 'PW', countryName: 'Palau', region: 'Oceania' },
  { countryCode: 'PG', countryName: 'Papua New Guinea', region: 'Oceania' },
  { countryCode: 'WS', countryName: 'Samoa', region: 'Oceania' },
  { countryCode: 'SB', countryName: 'Solomon Islands', region: 'Oceania' },
  { countryCode: 'TO', countryName: 'Tonga', region: 'Oceania' },
  { countryCode: 'TV', countryName: 'Tuvalu', region: 'Oceania' },
  { countryCode: 'VU', countryName: 'Vanuatu', region: 'Oceania' },
];

async function seedCountries() {
  console.log('🌍 Starting countries seed...');

  let inserted = 0;
  let skipped = 0;

  for (const country of countriesData) {
    try {
      await prisma.country.upsert({
        where: { countryCode: country.countryCode },
        update: {}, // Don't update existing countries
        create: country,
      });
      inserted++;
      console.log(`✅ ${country.countryCode} - ${country.countryName}`);
    } catch (error) {
      skipped++;
      console.error(`❌ Failed to insert ${country.countryCode}:`, error);
    }
  }

  console.log(`\n✅ Countries seeded: ${inserted} inserted, ${skipped} skipped`);
  console.log(`Total countries in database: ${countriesData.length}`);
}

// Run seed if executed directly
if (require.main === module) {
  seedCountries()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export default seedCountries;
