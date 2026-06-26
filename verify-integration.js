// Quick verification of plugin schema integration
import { OPERATION_REGISTRY, getOperationDefinition } from './src/lib/operations/registry.js';
import { OPERATION_INTENT_MAP } from './src/lib/operations/intent-data.js';
import { CHAIN_REGISTRY, findChainsByTrigger } from './src/lib/operations/chain-registry.js';

console.log('=== Plugin Schema Integration Verification ===\n');

// 1. Check that all 15 operations are in registry
const opIds = Object.keys(OPERATION_REGISTRY);
console.log(`1. OPERATION_REGISTRY has ${opIds.length} operations:`);
opIds.forEach(id => console.log(`   - ${id}`));

// 2. Check that dissolve-global and crs-assign are present
console.log('\n2. New operations added:');
['dissolve-global', 'crs-assign'].forEach(id => {
  const def = OPERATION_REGISTRY[id];
  if (def) {
    console.log(`   ✓ ${id}: ${def.label} (${def.family})`);
  } else {
    console.log(`   ✗ ${id}: MISSING`);
  }
});

// 3. Check that intent fields are attached
console.log('\n3. Intent fields attached:');
let intentCount = 0;
opIds.forEach(id => {
  const def = OPERATION_REGISTRY[id];
  if (def.intent) {
    intentCount++;
    console.log(`   ✓ ${id}: has intent (${def.intent.triggers.length} triggers)`);
  } else {
    console.log(`   ✗ ${id}: missing intent`);
  }
});
console.log(`   ${intentCount}/${opIds.length} operations have intent`);

// 4. Check that intent map matches
console.log('\n4. Intent map coverage:');
const intentIds = Object.keys(OPERATION_INTENT_MAP);
console.log(`   OPERATION_INTENT_MAP has ${intentIds.length} entries`);
const missingFromRegistry = intentIds.filter(id => !OPERATION_REGISTRY[id]);
if (missingFromRegistry.length > 0) {
  console.log(`   WARNING: ${missingFromRegistry.length} intents without registry entries:`);
  missingFromRegistry.forEach(id => console.log(`     - ${id}`));
} else {
  console.log('   ✓ All intents have registry entries');
}

// 5. Check chain registry
console.log('\n5. Chain registry:');
const chainIds = Object.keys(CHAIN_REGISTRY);
console.log(`   CHAIN_REGISTRY has ${chainIds.length} chains:`);
chainIds.forEach(id => {
  const chain = CHAIN_REGISTRY[id];
  console.log(`   - ${id}: ${chain.label} (${chain.steps.length} steps)`);
});

// 6. Test NL query resolver (import dynamically)
console.log('\n6. Testing NL query resolution:');
const query = 'Find parcels within 500 feet of the river';
const chains = findChainsByTrigger(query);
console.log(`   Query: "${query}"`);
if (chains.length > 0) {
  console.log(`   Found ${chains.length} chain(s):`);
  chains.forEach(c => console.log(`     - ${c.id}: ${c.description}`));
} else {
  console.log('   No chains found');
}

// Test operation trigger matching
console.log('\n7. Testing operation trigger matching:');
const testOps = [
  { query: 'buffer the parcels', expected: 'buffer' },
  { query: 'calculate area', expected: 'area-v1' },
  { query: 'dissolve all parcels', expected: 'dissolve-global' },
  { query: 'set CRS to EPSG:4326', expected: 'crs-assign' },
];

testOps.forEach(test => {
  const lower = test.query.toLowerCase();
  let found = null;
  for (const [id, intent] of Object.entries(OPERATION_INTENT_MAP)) {
    if (intent.triggers.some(trigger => lower.includes(trigger))) {
      found = id;
      break;
    }
  }
  if (found === test.expected) {
    console.log(`   ✓ "${test.query}" → ${found}`);
  } else {
    console.log(`   ✗ "${test.query}" → ${found} (expected ${test.expected})`);
  }
});

console.log('\n=== Verification complete ===');