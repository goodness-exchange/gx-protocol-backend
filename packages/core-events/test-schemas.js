#!/usr/bin/env node
/**
 * Quick test to verify all event schemas are registered and working
 */

const { schemaRegistry, eventValidator } = require('./dist/index.js');

console.log('=== Event Schema Registry Test ===\n');

// Get all event names
const eventNames = schemaRegistry.getAllEventNames();
console.log(`✅ Total schemas registered: ${schemaRegistry.getSchemaCount()}`);
console.log(`✅ Unique event names: ${eventNames.length}\n`);

// List all registered schemas
console.log('Registered schemas:');
const allMetadata = schemaRegistry.getAllMetadata();
allMetadata.forEach((meta, index) => {
  console.log(`  ${index + 1}. ${meta.eventName} v${meta.version}`);
});

console.log('\n=== Schema Lookup Test ===\n');

// Test retrieving specific schemas
const testEvents = [
  'UserCreated',
  'RelationshipRequested',
  'GenesisDistributionEvent',
  'TransferEvent',
  'VelocityTaxApplied',
  'OrgTxExecuted',
  'SystemPaused'
];

testEvents.forEach(eventName => {
  const schema = schemaRegistry.getSchema(eventName, '1.0');
  if (schema) {
    console.log(`✅ ${eventName} v1.0: Schema found`);
  } else {
    console.log(`❌ ${eventName} v1.0: Schema NOT found`);
  }
});

console.log('\n=== Event Validator Test ===\n');

// Test validator with a sample event
const sampleEvent = {
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  eventName: 'UserCreated',
  eventVersion: '1.0',
  timestamp: '2025-11-16T12:00:00Z',
  blockNumber: 1,
  txId: 'tx12345',
  chaincodeName: 'gxtv3',
  channelName: 'gxchannel',
  payload: {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    tenantId: 'tenant-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    status: 'PENDING_VERIFICATION',
    createdAt: '2025-11-16T12:00:00Z'
  }
};

console.log('Testing validator with sample UserCreated event...');
const result = eventValidator.validate(sampleEvent);

if (result.success) {
  console.log('✅ Event validation PASSED');
  console.log(`   Event: ${result.data.eventName} v${result.data.eventVersion}`);
} else {
  console.log('❌ Event validation FAILED');
  console.log('   Errors:', result.errors);
}

// Test validator stats
const stats = eventValidator.getStats();
console.log('\n=== Validator Stats ===\n');
console.log(`Cached validators: ${stats.cachedValidators}`);
console.log(`Registered schemas: ${stats.registeredSchemas}`);

console.log('\n✅ All tests completed successfully!\n');
