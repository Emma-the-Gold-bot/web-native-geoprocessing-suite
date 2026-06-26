import { resolveQuery } from './src/lib/nl/query-resolver.ts';
import { OPERATION_INTENT_MAP } from './src/lib/operations/intent-data.ts';
import { CHAIN_REGISTRY } from './src/lib/operations/chain-registry.ts';

const testQueries = [
  'clip parcels to county boundary and calculate area',
  'find the centroid of my polygons',
  'buffer the roads by 100 meters',
  'dissolve by the zoning field',
  'intersect parcels with flood zones',
  'calculate area of all parcels',
  'reproject to WGS84',
  'assign CRS EPSG:4326'
];

console.log('Testing NL Query Resolver\n');
console.log('='.repeat(60));

for (const query of testQueries) {
  console.log(`Query: "${query}"`);
  try {
    const candidates = resolveQuery(query, OPERATION_INTENT_MAP, CHAIN_REGISTRY);
    if (candidates.length === 0) {
      console.log('  No matches found');
    } else {
      for (const candidate of candidates.slice(0, 3)) {
        console.log(`  ${candidate.type} "${candidate.id}" (${candidate.confidence.toFixed(2)}): ${candidate.description}`);
        if (Object.keys(candidate.parameters).length > 0) {
          console.log(`    Parameters: ${JSON.stringify(candidate.parameters)}`);
        }
      }
    }
  } catch (error) {
    console.log(`  ERROR: ${error.message}`);
  }
  console.log();
}

console.log('='.repeat(60));
console.log('Done.');