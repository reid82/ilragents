#!/usr/bin/env npx tsx
/**
 * Quick test: call lookupListingByAddress with HPF_SERVICE_URL pointed at localhost.
 * This exercises the full pipeline path: address extraction -> HPF client -> listing data.
 *
 * Usage:
 *   HPF_SERVICE_URL=http://localhost:3100 HPF_API_KEY=test-local \
 *     npx tsx packages/pipeline/scripts/test-hpf-lookup.ts "101 Alma Rd Panton Hill VIC 3759"
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');

// Load env (same order as cli.ts)
config({ path: path.join(REPO_ROOT, '.env') });
config({ path: path.join(PACKAGE_ROOT, '.env') });

// Allow overrides from command line env
const address = process.argv[2];
if (!address) {
  console.error('Usage: npx tsx packages/pipeline/scripts/test-hpf-lookup.ts "<address>"');
  process.exit(1);
}

console.log(`\nHPF_SERVICE_URL = ${process.env.HPF_SERVICE_URL || '(not set)'}`);
console.log(`HPF_API_KEY     = ${process.env.HPF_API_KEY ? '***' : '(not set)'}\n`);

const { lookupListingByAddress } = await import('../src/pipeline/extractors/listing-lookup');

console.log(`Looking up: "${address}"\n`);

const result = await lookupListingByAddress(address, (msg) => {
  console.log(`  [progress] ${msg}`);
});

console.log(`\nResult: ${result.status}`);
console.log(`Source: ${result.source || 'n/a'}`);

if (result.listing) {
  const l = result.listing;
  console.log(`\n=== Listing ===`);
  console.log(`Address:        ${l.address}`);
  console.log(`Type:           ${l.propertyType} | ${l.bedrooms}/${l.bathrooms}/${l.parking}`);
  console.log(`Land:           ${l.landSize ?? 'n/a'} sqm`);
  console.log(`Price:          ${l.price || 'n/a'}`);
  console.log(`Price Guide:    ${l.priceGuide ? '$' + l.priceGuide.toLocaleString() : 'n/a'}`);
  console.log(`Images:         ${l.images?.length || 0}`);
  console.log(`History:        ${l.propertyHistory?.length || 0} entries`);
  console.log(`Comparables:    ${l.nearbySoldComparables?.length || 0}`);
  console.log(`Suburb Median:  ${l.suburbMedianPrice ? '$' + l.suburbMedianPrice.toLocaleString() : 'n/a'}`);
  console.log(`Enrichment:     ${l.enrichmentSource || 'n/a'}`);
  console.log(`URL:            ${l.url}`);
} else {
  console.log('No listing returned.');
}
