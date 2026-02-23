#!/usr/bin/env npx tsx
/**
 * Test the HPF extraction + mapping pipeline end-to-end.
 *
 * Usage:
 *   npx tsx packages/hpf-service/scripts/test-lookup.ts "123 Main St, Somewhere VIC 3000"
 *
 * This script:
 * 1. Launches a headed browser, restores session from disk (or pauses for manual login)
 * 2. Runs the full API replay extraction
 * 3. Maps results through listing-mapper and suburb-mapper
 * 4. Prints the mapped output as JSON
 * 5. Saves the raw extraction result for debugging
 *
 * Env vars:
 *   HPF_SESSION_PATH - path to saved session file (default: data/hpf-session.json)
 */

import { chromium, type BrowserContext } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExtractionRouter, type ExtractionResult } from '../src/extraction/router';
import { mapToListingData } from '../src/mapping/listing-mapper';
import { mapToSuburbContext } from '../src/mapping/suburb-mapper';
import { BrowserManager } from '../src/browser/manager';

// ── Config ────────────────────────────────────────────────────────────────

const address = process.argv[2];
if (!address) {
  console.error('Usage: npx tsx packages/hpf-service/scripts/test-lookup.ts "<address>"');
  console.error('Example: npx tsx packages/hpf-service/scripts/test-lookup.ts "15 Smith Street, Hurstbridge VIC 3099"');
  process.exit(1);
}

// Check for session files in order of preference
const sessionPaths = [
  process.env.HPF_SESSION_PATH || 'data/hpf-session.json',
  '../pipeline/data/hpf-discovery/hpf-session.json',
];

const sessionPath = sessionPaths.find(p => {
  const resolved = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', p);
  return fs.existsSync(resolved);
});

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[test] Looking up: "${address}"\n`);

  // Override config for local testing
  process.env.HPF_HEADLESS = 'false';
  if (sessionPath) {
    const resolved = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', sessionPath);
    process.env.HPF_SESSION_PATH = resolved;
    console.log(`[test] Using session from: ${resolved}`);
  } else {
    console.log('[test] No saved session found -- browser will open for manual login');
  }

  const browserManager = new BrowserManager();
  const router = new ExtractionRouter(browserManager);

  try {
    // Launch browser (will restore session if available)
    await browserManager.launch();

    // Check if session is valid by trying a simple API call
    const context = browserManager.getContext();
    if (!context) {
      throw new Error('No browser context after launch');
    }

    const cookies = await context.cookies('https://app.hotpropertyfinder.ai');
    const hasAuthCookies = cookies.some(c => c.name === 'accessToken' || c.name === 'refreshToken');

    if (!hasAuthCookies) {
      console.log('[test] No auth cookies found. Opening HPF for manual login...');
      console.log('[test] Please log in, then the script will continue.\n');

      const page = await browserManager.newPage();
      await page.goto('https://app.hotpropertyfinder.ai/auth/login/');
      await page.pause(); // Playwright Inspector opens -- log in manually, then close inspector
      await page.close();

      // Save the session after login
      await browserManager.saveSession();
      console.log('[test] Session saved after login.\n');
    } else {
      console.log(`[test] Found ${cookies.length} cookies including auth tokens.\n`);
    }

    // Run the lookup
    console.log('[test] Starting extraction...');
    const start = Date.now();
    const result = await router.lookupProperty(address);
    const elapsed = Date.now() - start;

    if (!result) {
      console.error('[test] Property not found.');
      process.exit(1);
    }

    console.log(`[test] Extraction complete in ${elapsed}ms (method: ${result.method})\n`);

    // Map to pipeline types
    const listing = mapToListingData(result);
    const suburbContext = result.suburbProfile ? mapToSuburbContext(result) : null;

    // Populate suburb stats on listing
    if (suburbContext) {
      listing.suburbMedianPrice = suburbContext.medianHousePrice;
      listing.suburbMedianRent = suburbContext.medianWeeklyRent;
      listing.suburbDaysOnMarket = suburbContext.averageDaysOnMarket;
      listing.suburbAuctionClearance = suburbContext.auctionClearanceRate;
    }

    // Print summary
    console.log('=== LISTING DATA ===');
    console.log(JSON.stringify(listing, null, 2));

    console.log('\n=== SUBURB CONTEXT ===');
    console.log(JSON.stringify(suburbContext, null, 2));

    // Print key stats
    console.log('\n=== KEY STATS ===');
    console.log(`Address:         ${listing.address}`);
    console.log(`Property Type:   ${listing.propertyType}`);
    console.log(`Beds/Bath/Park:  ${listing.bedrooms}/${listing.bathrooms}/${listing.parking}`);
    console.log(`Land Size:       ${listing.landSize ? listing.landSize + ' sqm' : 'n/a'}`);
    console.log(`Building Size:   ${listing.buildingSize ? listing.buildingSize + ' sqm' : 'n/a'}`);
    console.log(`Price:           ${listing.price || 'n/a'}`);
    console.log(`AVM Value:       ${listing.priceGuide ? '$' + listing.priceGuide.toLocaleString() : 'n/a'}`);
    console.log(`Year Built:      ${listing.rawData?.yearBuilt || 'n/a'}`);
    console.log(`Tenure:          ${listing.rawData?.tenure || 'n/a'}`);
    console.log(`CBD Distance:    ${listing.rawData?.locationInsights?.cbdDistanceDisplay || 'n/a'}`);
    console.log(`Days on Market:  ${listing.daysOnMarket ?? 'n/a'}`);
    console.log(`Images:          ${listing.images.length}`);
    console.log(`History entries: ${listing.propertyHistory.length}`);
    console.log(`Comparables:     ${listing.nearbySoldComparables.length}`);
    console.log(`Features:        ${listing.features.join(', ')}`);
    console.log(`URL:             ${listing.url}`);

    if (suburbContext) {
      console.log(`\n--- Suburb: ${suburbContext.suburb} ---`);
      console.log(`Population:      ${suburbContext.populationTotal?.toLocaleString() || 'n/a'}`);
      console.log(`Median House:    ${suburbContext.medianHousePrice ? '$' + suburbContext.medianHousePrice.toLocaleString() : 'n/a'}`);
      console.log(`Median Rent:     ${suburbContext.medianWeeklyRent ? '$' + suburbContext.medianWeeklyRent + '/wk' : 'n/a'}`);
      console.log(`Gross Yield:     ${suburbContext.grossRentalYield ? (suburbContext.grossRentalYield * 100).toFixed(1) + '%' : 'n/a'}`);
      console.log(`Vacancy Rate:    ${suburbContext.vacancyRate ? (suburbContext.vacancyRate * 100).toFixed(1) + '%' : 'n/a'}`);
      console.log(`DOM Median:      ${suburbContext.averageDaysOnMarket ?? 'n/a'}`);
      console.log(`Owner Occupied:  ${suburbContext.ownerOccupierPct ? (suburbContext.ownerOccupierPct * 100).toFixed(0) + '%' : 'n/a'}`);
      console.log(`1yr Growth:      ${suburbContext.priceGrowth1yr ? (suburbContext.priceGrowth1yr * 100).toFixed(1) + '%' : 'n/a'}`);
      console.log(`5yr Growth:      ${suburbContext.priceGrowth5yr ? (suburbContext.priceGrowth5yr * 100).toFixed(1) + '%' : 'n/a'}`);
      console.log(`Household Inc:   ${suburbContext.medianHouseholdIncome ? '$' + suburbContext.medianHouseholdIncome.toLocaleString() + '/yr' : 'n/a'}`);
    }

    // Save raw extraction result for debugging
    const outputDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputFile = path.join(outputDir, `test-result-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(outputFile, JSON.stringify({ raw: result, listing, suburbContext }, null, 2));
    console.log(`\n[test] Raw result saved to: ${outputFile}`);

    // Save session for reuse
    await browserManager.saveSession();

  } finally {
    await browserManager.close();
  }
}

main().catch(err => {
  console.error('[test] Fatal error:', err);
  process.exit(1);
});
