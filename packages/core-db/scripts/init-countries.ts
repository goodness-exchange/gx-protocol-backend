import { db } from '../src';
import * as fs from 'fs';

async function main() {
  const countriesData = JSON.parse(
    fs.readFileSync('/home/sugxcoin/prod-blockchain/gx-protocol-backend/countries-init.json', 'utf8')
  );
  
  const timestamp = new Date().getTime();
  const command = await db.outboxCommand.create({
    data: {
      tenantId: 'default',
      service: 'svc-admin',
      requestId: `init-countries-${timestamp}`,
      commandType: 'INITIALIZE_COUNTRY_DATA',
      payload: countriesData as any,
      status: 'PENDING',
      attempts: 0,
    },
  });
  
  console.log('✅ Country initialization command created with ID:', command.id);
  console.log('📊 Command will initialize', countriesData.countriesData.length, 'countries');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  });
