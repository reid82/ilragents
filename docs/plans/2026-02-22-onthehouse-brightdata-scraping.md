# OnTheHouse.com.au + Bright Data Scraping Browser Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add onthehouse.com.au as a third listing source in the SerpAPI lookup chain, and replace Apify/Cheerio scraping with Bright Data Scraping Browser for faster, cheaper, more reliable page rendering.

**Architecture:** SerpAPI finds listing URLs across Domain, REA, and OnTheHouse. Bright Data Scraping Browser (CDP/Playwright) replaces Cheerio + Apify for page rendering and data extraction. Existing merge functions reused. Backwards-compatible: falls back to Cheerio/Apify if Bright Data not configured.

**Tech Stack:** TypeScript, Playwright (CDP connect), Vitest, SerpAPI, Bright Data Scraping Browser

---

## Prerequisites

- Bright Data account with Scraping Browser zone configured
- `BRIGHT_DATA_BROWSER_WS` endpoint URL (includes auth credentials)
- `playwright-core` npm package (no browser download needed - connects to remote)

---

### Task 1: Create feature branch and install playwright-core

**Files:**
- Modify: `packages/pipeline/package.json`

**Step 1: Create feature branch**

```bash
git checkout -b feat/onthehouse-brightdata
```

**Step 2: Install playwright-core**

`playwright-core` is the library-only version - no browser binaries downloaded. We connect to Bright Data's remote browser via CDP.

```bash
cd packages/pipeline && npm install playwright-core
```

**Step 3: Verify install**

Run: `cd packages/pipeline && node -e "require('playwright-core'); console.log('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add packages/pipeline/package.json packages/pipeline/package-lock.json
git commit -m "chore: add playwright-core for Bright Data CDP connection"
```

---

### Task 2: Widen ListingData source types for OnTheHouse

**Files:**
- Modify: `packages/pipeline/src/pipeline/extractors/listing-types.ts:1-2,46,144-152`
- Test: `packages/pipeline/src/pipeline/extractors/listing-types.test.ts` (new)

**Step 1: Write the failing test**

Create `packages/pipeline/src/pipeline/extractors/listing-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectListingUrl } from './listing-types';

describe('detectListingUrl', () => {
  it('detects domain.com.au URLs', () => {
    const result = detectListingUrl('https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812');
    expect(result).toEqual({ url: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812', source: 'domain' });
  });

  it('detects realestate.com.au URLs', () => {
    const result = detectListingUrl('https://www.realestate.com.au/property-house-vic-cowes-143160680');
    expect(result).toEqual({ url: 'https://www.realestate.com.au/property-house-vic-cowes-143160680', source: 'rea' });
  });

  it('detects onthehouse.com.au URLs', () => {
    const result = detectListingUrl('https://www.onthehouse.com.au/property/vic/cowes-3922/44-red-rocks-rd-cowes-vic-3922-12345');
    expect(result).toEqual({ url: 'https://www.onthehouse.com.au/property/vic/cowes-3922/44-red-rocks-rd-cowes-vic-3922-12345', source: 'onthehouse' });
  });

  it('returns null for unknown URLs', () => {
    expect(detectListingUrl('https://www.google.com')).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && npx vitest run src/pipeline/extractors/listing-types.test.ts`
Expected: FAIL - `detectListingUrl` doesn't handle onthehouse URLs and source type doesn't include `'onthehouse'`

**Step 3: Update listing-types.ts**

In `packages/pipeline/src/pipeline/extractors/listing-types.ts`:

Change the `ListingData` interface `source` field (line 2):
```typescript
  source: 'domain' | 'rea' | 'onthehouse';
```

Change the `enrichmentSource` field (line 46):
```typescript
  enrichmentSource: 'apify-detail' | 'cheerio' | 'serp-snippet' | 'bright-data' | null;
```

Update `detectListingUrl` function to add OTH detection before the `return null` (after line 149):
```typescript
  const othMatch = text.match(/(https?:\/\/(?:www\.)?onthehouse\.com\.au\/[^\s]+)/i);
  if (othMatch) return { url: othMatch[1], source: 'onthehouse' };
```

**Step 4: Run test to verify it passes**

Run: `cd packages/pipeline && npx vitest run src/pipeline/extractors/listing-types.test.ts`
Expected: PASS

**Step 5: Run all existing tests to check nothing broke**

Run: `cd packages/pipeline && npx vitest run`
Expected: All pass (source type widening is backwards-compatible)

**Step 6: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/listing-types.ts packages/pipeline/src/pipeline/extractors/listing-types.test.ts
git commit -m "feat: widen ListingData source type to include onthehouse"
```

---

### Task 3: Add OnTheHouse to SerpAPI search chain

**Files:**
- Modify: `packages/pipeline/src/pipeline/intelligence/serper-lookup.ts:18-24,56-65,120-138`
- Test: `packages/pipeline/src/pipeline/intelligence/serper-lookup.test.ts` (new)

**Step 1: Write the failing test**

Create `packages/pipeline/src/pipeline/intelligence/serper-lookup.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findListingUrlViaSerper } from './serper-lookup';
import type { ParsedAddress } from '../extractors/listing-types';

const testAddr: ParsedAddress = {
  streetNumber: '44',
  streetName: 'Red Rocks',
  streetType: 'Rd',
  suburb: 'Cowes',
  state: 'VIC',
  postcode: '3922',
};

describe('findListingUrlViaSerper', () => {
  beforeEach(() => {
    vi.stubEnv('SERPER_API_KEY', 'test-key');
    vi.restoreAllMocks();
  });

  it('returns null when SERPER_API_KEY not configured', async () => {
    vi.stubEnv('SERPER_API_KEY', '');
    const result = await findListingUrlViaSerper(testAddr);
    expect(result).toBeNull();
  });

  it('searches domain, then rea, then onthehouse in order', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      return new Response(JSON.stringify({ organic_results: [] }), { status: 200 });
    });

    await findListingUrlViaSerper(testAddr);

    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain('domain.com.au');
    expect(calls[1]).toContain('realestate.com.au');
    expect(calls[2]).toContain('onthehouse.com.au');
  });

  it('returns onthehouse result when domain and rea miss', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        // Domain and REA return no valid results
        return new Response(JSON.stringify({ organic_results: [] }), { status: 200 });
      }
      // OTH returns a result
      return new Response(JSON.stringify({
        organic_results: [{
          title: '44 Red Rocks Road, Cowes VIC 3922 - OnTheHouse',
          link: 'https://www.onthehouse.com.au/property/vic/cowes-3922/44-red-rocks-rd-cowes-vic-3922-4937422',
          snippet: '3 bedroom house. Estimated value $650,000 - $700,000.',
        }],
      }), { status: 200 });
    });

    const result = await findListingUrlViaSerper(testAddr);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('onthehouse');
    expect(result!.url).toContain('onthehouse.com.au/property/');
  });

  it('stops at domain when domain has a match', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({
        organic_results: [{
          title: '44 Red Rocks Road, Cowes VIC 3922',
          link: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812',
          snippet: '3 bed house',
        }],
      }), { status: 200 });
    });

    const result = await findListingUrlViaSerper(testAddr);

    expect(result!.source).toBe('domain');
    // Should only have made 1 fetch call (domain found, skip rea + oth)
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/serper-lookup.test.ts`
Expected: FAIL - `onthehouse` search not implemented, only 2 calls made instead of 3

**Step 3: Update serper-lookup.ts**

In `packages/pipeline/src/pipeline/intelligence/serper-lookup.ts`:

Update `SerperLookupResult` interface (line 22):
```typescript
export interface SerperLookupResult {
  url: string;
  source: 'domain' | 'rea' | 'onthehouse';
  title: string;
  snippet: string;
  thumbnail?: string;
}
```

Add OTH search after REA in `findListingUrlViaSerper` (after line 62, before the "No listing found" log):
```typescript
  // Fall back to OnTheHouse
  const othResult = await searchSite('onthehouse.com.au', addressStr, apiKey);
  if (othResult) return othResult;

  console.log('[serpapi] No listing found on Domain, REA, or OnTheHouse');
  return null;
```

Remove the old "No listing found" log at line 64.

Add OTH URL matching in `searchSite` function, inside the `for` loop (after the REA check at line 111):
```typescript
      if (site === 'onthehouse.com.au' && isOnthehouseUrl(url)) {
        console.log(`[serpapi] Found OnTheHouse listing: ${url}`);
        return { url, source: 'onthehouse', title: result.title, snippet: result.snippet || '', thumbnail: result.thumbnail };
      }
```

Add URL validator function at end of file:
```typescript
/** Check if a URL is an onthehouse.com.au property page */
function isOnthehouseUrl(url: string): boolean {
  if (!/onthehouse\.com\.au/i.test(url)) return false;
  // Match property pages: /property/{state}/{suburb}-{postcode}/{slug}
  return /onthehouse\.com\.au\/property\//i.test(url);
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/serper-lookup.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `cd packages/pipeline && npx vitest run`
Expected: All pass

**Step 6: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/serper-lookup.ts packages/pipeline/src/pipeline/intelligence/serper-lookup.test.ts
git commit -m "feat: add onthehouse.com.au to SerpAPI search chain"
```

---

### Task 4: Create Bright Data Scraping Browser client

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/bright-data-scraper.ts`
- Test: `packages/pipeline/src/pipeline/intelligence/bright-data-scraper.test.ts` (new)

**Step 1: Write the failing test**

Create `packages/pipeline/src/pipeline/intelligence/bright-data-scraper.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock playwright-core before imports
const mockNewPage = vi.fn();
const mockClose = vi.fn();
const mockGoto = vi.fn();
const mockEvaluate = vi.fn();
const mockWaitForSelector = vi.fn();
const mockContent = vi.fn();

vi.mock('playwright-core', () => ({
  chromium: {
    connectOverCDP: vi.fn().mockResolvedValue({
      newPage: mockNewPage.mockResolvedValue({
        goto: mockGoto.mockResolvedValue(null),
        evaluate: mockEvaluate,
        waitForSelector: mockWaitForSelector.mockResolvedValue(null),
        content: mockContent.mockResolvedValue('<html></html>'),
        close: vi.fn(),
      }),
      close: mockClose,
    }),
  },
}));

import { scrapeWithBrightData } from './bright-data-scraper';

describe('scrapeWithBrightData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BRIGHT_DATA_BROWSER_WS', 'wss://brd-customer-test:pass@brd.superproxy.io:9222');
  });

  it('returns null when BRIGHT_DATA_BROWSER_WS not configured', async () => {
    vi.stubEnv('BRIGHT_DATA_BROWSER_WS', '');
    const result = await scrapeWithBrightData('https://example.com', async () => ({}));
    expect(result).toBeNull();
  });

  it('connects via CDP and runs extractor', async () => {
    const extractedData = { bedrooms: 3, price: '$650,000' };
    const extractor = vi.fn().mockResolvedValue(extractedData);

    const result = await scrapeWithBrightData(
      'https://www.onthehouse.com.au/property/vic/cowes-3922/test',
      extractor,
    );

    expect(result).toEqual(extractedData);
    expect(mockGoto).toHaveBeenCalledWith(
      'https://www.onthehouse.com.au/property/vic/cowes-3922/test',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(extractor).toHaveBeenCalled();
  });

  it('closes browser on success', async () => {
    const extractor = vi.fn().mockResolvedValue({});
    await scrapeWithBrightData('https://example.com', extractor);
    expect(mockClose).toHaveBeenCalled();
  });

  it('closes browser on error and returns null', async () => {
    const extractor = vi.fn().mockRejectedValue(new Error('Parse error'));
    const result = await scrapeWithBrightData('https://example.com', extractor);
    expect(result).toBeNull();
    expect(mockClose).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/bright-data-scraper.test.ts`
Expected: FAIL - module not found

**Step 3: Create bright-data-scraper.ts**

Create `packages/pipeline/src/pipeline/intelligence/bright-data-scraper.ts`:

```typescript
/**
 * Bright Data Scraping Browser - CDP-based headless browser for page rendering.
 *
 * Replaces Apify actors + Cheerio for scraping listing pages.
 * Connects via Chrome DevTools Protocol to Bright Data's managed browser
 * which handles anti-bot bypass, CAPTCHA solving, and fingerprinting.
 *
 * Env: BRIGHT_DATA_BROWSER_WS - WebSocket endpoint (includes auth)
 * Example: wss://brd-customer-XXXX-zone-scraping_browser:PASSWORD@brd.superproxy.io:9222
 */

import type { Page } from 'playwright-core';

const SCRAPE_TIMEOUT_MS = 30000;

export type PageExtractor = (page: Page) => Promise<Record<string, unknown>>;

/**
 * Scrape a URL using Bright Data Scraping Browser.
 *
 * Connects via CDP, navigates to URL, waits for JS rendering,
 * then runs the provided extractor function against the page.
 *
 * Returns null if BRIGHT_DATA_BROWSER_WS not configured or on error.
 */
export async function scrapeWithBrightData(
  url: string,
  extractor: PageExtractor,
): Promise<Record<string, unknown> | null> {
  const wsEndpoint = process.env.BRIGHT_DATA_BROWSER_WS;
  if (!wsEndpoint) {
    console.log('[bright-data] BRIGHT_DATA_BROWSER_WS not configured, skipping');
    return null;
  }

  let browser;
  try {
    const { chromium } = await import('playwright-core');
    console.log(`[bright-data] Connecting to Scraping Browser for: ${url}`);

    browser = await chromium.connectOverCDP(wsEndpoint);
    const page = await browser.newPage();

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: SCRAPE_TIMEOUT_MS,
    });

    // Give JS time to hydrate (React/Redux apps need this)
    await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});

    const data = await extractor(page);
    await page.close();

    console.log(`[bright-data] Extracted ${Object.keys(data).length} fields from: ${url}`);
    return data;
  } catch (err) {
    console.error('[bright-data] Scrape failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/bright-data-scraper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/bright-data-scraper.ts packages/pipeline/src/pipeline/intelligence/bright-data-scraper.test.ts
git commit -m "feat: add Bright Data Scraping Browser CDP client"
```

---

### Task 5: Create OnTheHouse page extractor and merge function

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/onthehouse-extractor.ts`
- Test: `packages/pipeline/src/pipeline/intelligence/onthehouse-extractor.test.ts` (new)

**Step 1: Write the failing test**

Create `packages/pipeline/src/pipeline/intelligence/onthehouse-extractor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mergeOnthehouseDetail, parseOnthehouseData } from './onthehouse-extractor';
import type { ListingData } from '../extractors/listing-types';
import { LISTING_DETAIL_DEFAULTS } from '../extractors/listing-types';

const baseListing: ListingData = {
  source: 'onthehouse',
  url: 'https://www.onthehouse.com.au/property/vic/cowes-3922/44-red-rocks-rd-cowes-vic-3922-12345',
  address: '44 Red Rocks Rd Cowes VIC 3922',
  suburb: 'Cowes',
  state: 'VIC',
  postcode: '3922',
  propertyType: 'house',
  bedrooms: 3,
  bathrooms: 2,
  parking: 1,
  landSize: null,
  buildingSize: null,
  price: null,
  priceGuide: null,
  listingType: 'unknown',
  auctionDate: null,
  daysOnMarket: null,
  description: 'From SerpAPI snippet',
  features: [],
  images: [],
  agentName: null,
  agencyName: null,
  suburbMedianPrice: null,
  suburbMedianRent: null,
  suburbDaysOnMarket: null,
  suburbAuctionClearance: null,
  ...LISTING_DETAIL_DEFAULTS,
  enrichmentSource: 'serp-snippet',
  rawData: {},
};

describe('parseOnthehouseData', () => {
  it('parses property attributes from raw extracted data', () => {
    const raw = {
      bedrooms: 4,
      bathrooms: 2,
      carSpaces: 2,
      propertyType: 'House',
      landSize: 650,
      estimatedValue: '$680,000 - $740,000',
      propertyHistory: [
        { date: '2020-03-15', event: 'Sold', price: '$620,000' },
        { date: '2018-06-01', event: 'Listed', price: '$600,000' },
      ],
      councilRates: '$2,100',
    };

    const result = parseOnthehouseData(raw);

    expect(result.bedrooms).toBe(4);
    expect(result.bathrooms).toBe(2);
    expect(result.parking).toBe(2);
    expect(result.propertyType).toBe('house');
    expect(result.landSize).toBe(650);
    expect(result.priceGuide).toBe(680000);
    expect(result.propertyHistory).toHaveLength(2);
    expect(result.propertyHistory[0]).toEqual({
      date: '2020-03-15',
      event: 'sold',
      price: 620000,
      source: 'onthehouse',
    });
    expect(result.councilRates).toBe(2100);
  });

  it('handles missing fields gracefully', () => {
    const result = parseOnthehouseData({});
    expect(result.bedrooms).toBeNull();
    expect(result.propertyHistory).toEqual([]);
    expect(result.priceGuide).toBeNull();
  });
});

describe('mergeOnthehouseDetail', () => {
  it('merges OTH data over snippet-based listing', () => {
    const raw = {
      bedrooms: 4,
      bathrooms: 2,
      carSpaces: 2,
      propertyType: 'House',
      landSize: 650,
      estimatedValue: '$680,000 - $740,000',
      description: 'A spacious family home with 4 bedrooms and large backyard',
      propertyHistory: [
        { date: '2020-03-15', event: 'Sold', price: '$620,000' },
      ],
    };

    const merged = mergeOnthehouseDetail(baseListing, raw);

    expect(merged.bedrooms).toBe(4);
    expect(merged.landSize).toBe(650);
    expect(merged.priceGuide).toBe(680000);
    expect(merged.description).toContain('spacious family home');
    expect(merged.propertyHistory).toHaveLength(1);
    expect(merged.enrichmentSource).toBe('bright-data');
    expect(merged.enrichedAt).toBeTruthy();
  });

  it('keeps original data when OTH data is empty', () => {
    const merged = mergeOnthehouseDetail(baseListing, {});

    expect(merged.bedrooms).toBe(3); // from baseListing
    expect(merged.description).toBe('From SerpAPI snippet');
    expect(merged.enrichmentSource).toBe('bright-data');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/onthehouse-extractor.test.ts`
Expected: FAIL - module not found

**Step 3: Create onthehouse-extractor.ts**

Create `packages/pipeline/src/pipeline/intelligence/onthehouse-extractor.ts`:

```typescript
/**
 * OnTheHouse.com.au data extraction and mapping.
 *
 * OTH is powered by CoreLogic and provides:
 * - Property attributes (beds, baths, parking, land size)
 * - Estimated value range (CoreLogic AVM)
 * - Sale history (dates + prices)
 * - Council rates
 *
 * OTH does NOT typically provide:
 * - Active listing info (agent, inspection times, days on market)
 * - Floor plans, virtual tours
 * - Auction dates
 */

import type { Page } from 'playwright-core';
import type { ListingData, PropertyHistoryEntry } from '../extractors/listing-types';

/** Parse a numeric price from display text like "$650,000 - $700,000" (takes first price) */
function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\$[\d,]+/);
  if (!match) return null;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || null;
}

/** Categorise a history event string */
function categoriseEvent(event: string): PropertyHistoryEntry['event'] {
  const lower = event.toLowerCase();
  if (lower.includes('sold') || lower.includes('sale')) return 'sold';
  if (lower.includes('list')) return 'listed';
  if (lower.includes('withdraw') || lower.includes('removed')) return 'withdrawn';
  if (lower.includes('rent') || lower.includes('lease')) return 'rental';
  return 'other';
}

/** Intermediate parsed data from OTH page */
interface OnthehouseParsed {
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  propertyType: string;
  landSize: number | null;
  buildingSize: number | null;
  priceGuide: number | null;
  description: string;
  propertyHistory: PropertyHistoryEntry[];
  councilRates: number | null;
  bodyCorpFees: number | null;
  images: string[];
}

/**
 * Parse raw extracted data from OTH page into structured fields.
 */
export function parseOnthehouseData(raw: Record<string, unknown>): OnthehouseParsed {
  const history = Array.isArray(raw.propertyHistory) ? raw.propertyHistory : [];

  return {
    bedrooms: typeof raw.bedrooms === 'number' ? raw.bedrooms : null,
    bathrooms: typeof raw.bathrooms === 'number' ? raw.bathrooms : null,
    parking: typeof raw.carSpaces === 'number' ? raw.carSpaces
      : typeof raw.parking === 'number' ? raw.parking : null,
    propertyType: typeof raw.propertyType === 'string' ? raw.propertyType.toLowerCase() : 'unknown',
    landSize: typeof raw.landSize === 'number' ? raw.landSize : null,
    buildingSize: typeof raw.buildingSize === 'number' ? raw.buildingSize : null,
    priceGuide: parsePrice(raw.estimatedValue as string),
    description: typeof raw.description === 'string' ? raw.description : '',
    propertyHistory: history.map((h: unknown): PropertyHistoryEntry => {
      const entry = h as Record<string, unknown>;
      return {
        date: (entry.date as string) || '',
        event: categoriseEvent((entry.event as string) || ''),
        price: parsePrice(entry.price as string),
        source: 'onthehouse',
      };
    }),
    councilRates: parsePrice(raw.councilRates as string),
    bodyCorpFees: parsePrice(raw.bodyCorpFees as string),
    images: Array.isArray(raw.images) ? (raw.images as string[]) : [],
  };
}

/**
 * Merge OTH extracted data into an existing ListingData.
 * Only overwrites fields that are richer than what we already have.
 */
export function mergeOnthehouseDetail(listing: ListingData, raw: Record<string, unknown>): ListingData {
  const parsed = parseOnthehouseData(raw);

  return {
    ...listing,
    bedrooms: parsed.bedrooms ?? listing.bedrooms,
    bathrooms: parsed.bathrooms ?? listing.bathrooms,
    parking: parsed.parking ?? listing.parking,
    propertyType: parsed.propertyType !== 'unknown' ? parsed.propertyType : listing.propertyType,
    landSize: parsed.landSize ?? listing.landSize,
    buildingSize: parsed.buildingSize ?? listing.buildingSize,
    priceGuide: parsed.priceGuide ?? listing.priceGuide,
    price: parsed.priceGuide ? `$${parsed.priceGuide.toLocaleString()}` : listing.price,
    description: parsed.description.length > listing.description.length
      ? parsed.description : listing.description,
    propertyHistory: parsed.propertyHistory.length > 0
      ? parsed.propertyHistory : listing.propertyHistory,
    councilRates: parsed.councilRates ?? listing.councilRates,
    bodyCorpFees: parsed.bodyCorpFees ?? listing.bodyCorpFees,
    images: parsed.images.length > listing.images.length
      ? parsed.images : listing.images,
    enrichedAt: new Date().toISOString(),
    enrichmentSource: 'bright-data',
    rawData: { ...listing.rawData, _othDetail: raw },
  };
}

/**
 * Playwright page extractor for onthehouse.com.au.
 *
 * Attempts to extract data from:
 * 1. window.REDUX_DATA (if available)
 * 2. Rendered DOM elements (fallback)
 */
export async function extractOnthehousePage(page: Page): Promise<Record<string, unknown>> {
  // Wait for the property content to render
  await page.waitForSelector('[class*="property"], [data-testid*="property"], main', { timeout: 10000 }).catch(() => {});

  return page.evaluate(() => {
    const data: Record<string, unknown> = {};

    // Try Redux store first
    const reduxData = (window as Record<string, unknown>).REDUX_DATA as Record<string, unknown> | undefined;
    if (reduxData) {
      return reduxData;
    }

    // Fallback: extract from rendered DOM
    const getText = (selector: string): string | null => {
      const el = document.querySelector(selector);
      return el?.textContent?.trim() || null;
    };

    const getNumber = (selector: string): number | null => {
      const text = getText(selector);
      if (!text) return null;
      const match = text.match(/\d+/);
      return match ? parseInt(match[0], 10) : null;
    };

    // Property attributes - try common OTH class patterns
    const allText = document.body.innerText;

    // Beds/baths/car from icon groups or text
    const bedsMatch = allText.match(/(\d+)\s*(?:bed|bedroom)/i);
    const bathsMatch = allText.match(/(\d+)\s*(?:bath|bathroom)/i);
    const carsMatch = allText.match(/(\d+)\s*(?:car|parking|garage)/i);

    if (bedsMatch) data.bedrooms = parseInt(bedsMatch[1], 10);
    if (bathsMatch) data.bathrooms = parseInt(bathsMatch[1], 10);
    if (carsMatch) data.carSpaces = parseInt(carsMatch[1], 10);

    // Property type
    const typeMatch = allText.match(/property\s*type[:\s]*(house|apartment|unit|townhouse|villa|land|studio|duplex|terrace)/i);
    if (typeMatch) data.propertyType = typeMatch[1];

    // Land size
    const landMatch = allText.match(/land\s*(?:size|area)[:\s]*(\d[\d,]*)\s*(?:m²|sqm)/i);
    if (landMatch) data.landSize = parseInt(landMatch[1].replace(/,/g, ''), 10);

    // Estimated value
    const valueMatch = allText.match(/(?:estimated|value|worth)[:\s]*(\$[\d,]+(?:\s*-\s*\$[\d,]+)?)/i);
    if (valueMatch) data.estimatedValue = valueMatch[1];

    // Council rates
    const ratesMatch = allText.match(/council\s*rates?[:\s]*(\$[\d,]+)/i);
    if (ratesMatch) data.councilRates = ratesMatch[1];

    // Description - look for the longest paragraph
    const paragraphs = Array.from(document.querySelectorAll('p'));
    const longest = paragraphs
      .map(p => p.textContent?.trim() || '')
      .filter(t => t.length > 50)
      .sort((a, b) => b.length - a.length)[0];
    if (longest) data.description = longest;

    // Images
    const images = Array.from(document.querySelectorAll('img[src*="property"], img[src*="photo"], img[src*="image"]'))
      .map(img => (img as HTMLImageElement).src)
      .filter(Boolean);
    if (images.length > 0) data.images = images;

    return data;
  });
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/onthehouse-extractor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/onthehouse-extractor.ts packages/pipeline/src/pipeline/intelligence/onthehouse-extractor.test.ts
git commit -m "feat: add OnTheHouse page extractor and merge function"
```

---

### Task 6: Update listing-lookup.ts to use Bright Data and support OnTheHouse

**Files:**
- Modify: `packages/pipeline/src/pipeline/extractors/listing-lookup.ts`
- Modify: `packages/pipeline/src/pipeline/extractors/listing-lookup.test.ts`

**Step 1: Write the new tests**

Add to `packages/pipeline/src/pipeline/extractors/listing-lookup.test.ts`. At the top, add the new mock alongside existing mocks:

```typescript
const mockScrapeWithBrightData = vi.fn();

vi.mock('../intelligence/bright-data-scraper', () => ({
  scrapeWithBrightData: (...args: unknown[]) => mockScrapeWithBrightData(...args),
}));
```

In `beforeEach`, add:
```typescript
    mockScrapeWithBrightData.mockResolvedValue(null);
```

Add new describe block at end of the outer `describe`:

```typescript
  describe('OnTheHouse fallback via Serper', () => {
    it('finds OTH listing when Serper returns onthehouse source', async () => {
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.onthehouse.com.au/property/vic/cowes-3922/44-red-rocks-rd-12345',
        source: 'onthehouse',
        title: '44 Red Rocks Road, Cowes VIC 3922',
        snippet: '3 bed, 2 bath house. Estimated $650,000.',
      });
      // OTH is JS-rendered, so Cheerio scrape will fail
      mockScrapeListing.mockRejectedValue(new Error('Unsupported listing URL'));

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.source).toBe('serper-onthehouse');
      expect(result.listing).toBeDefined();
      expect(result.listing!.source).toBe('onthehouse');
    });
  });

  describe('Bright Data scraping', () => {
    it('uses Bright Data when available instead of Cheerio', async () => {
      vi.stubEnv('BRIGHT_DATA_BROWSER_WS', 'wss://test@brd.superproxy.io:9222');
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812',
        source: 'domain',
        title: 'Test listing',
        snippet: '3 bed house',
      });
      const brightDataResult = {
        bedrooms: 3,
        bathrooms: 2,
        description: 'A lovely 3 bedroom home scraped via Bright Data',
        propertyType: 'house',
      };
      mockScrapeWithBrightData.mockResolvedValue(brightDataResult);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(mockScrapeWithBrightData).toHaveBeenCalled();
    });

    it('falls back to Cheerio when Bright Data not configured', async () => {
      vi.stubEnv('BRIGHT_DATA_BROWSER_WS', '');
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.domain.com.au/44-red-rocks-road-cowes-vic-3922-2019540812',
        source: 'domain',
        title: 'Test',
        snippet: '',
      });
      mockScrapeWithBrightData.mockResolvedValue(null);
      const fakeListing = { source: 'domain', address: '44 Red Rocks Rd', url: 'test', description: 'from cheerio' };
      mockScrapeListing.mockResolvedValue(fakeListing);

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(mockScrapeListing).toHaveBeenCalled();
    });

    it('falls back to snippet when both Bright Data and Cheerio fail', async () => {
      vi.stubEnv('BRIGHT_DATA_BROWSER_WS', 'wss://test@brd.superproxy.io:9222');
      mockExtract.mockResolvedValue(testAddr);
      mockFindListingUrlViaSerper.mockResolvedValue({
        url: 'https://www.domain.com.au/listing-123',
        source: 'domain',
        title: '44 Red Rocks Road, Cowes VIC 3922 - 3 bedroom house',
        snippet: 'A 3 bedroom, 2 bathroom house sold for $405000.',
      });
      mockScrapeWithBrightData.mockResolvedValue(null);
      mockScrapeListing.mockRejectedValue(new Error('403 Forbidden'));

      const result = await lookupListingByAddress('44 Red Rocks Rd Cowes');

      expect(result.status).toBe('found');
      expect(result.listing!.bedrooms).toBe(3);
      expect(result.listing!.enrichmentSource).toBe('serp-snippet');
    });
  });
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/pipeline && npx vitest run src/pipeline/extractors/listing-lookup.test.ts`
Expected: FAIL - new tests fail because listing-lookup.ts doesn't import bright-data-scraper or handle 'onthehouse' source

**Step 3: Update listing-lookup.ts**

Replace the full content of `packages/pipeline/src/pipeline/extractors/listing-lookup.ts`:

```typescript
import type { ListingData, ParsedAddress } from './listing-types';
import { formatAddressForSearch, LISTING_DETAIL_DEFAULTS } from './listing-types';
import { extractAddressFromMessage } from './address-extractor';
import { enrichListingDetail } from '../intelligence/apify-listing-detail';
import type { SerperLookupResult } from '../intelligence/serper-lookup';

export interface LookupResult {
  status: 'found' | 'not-found' | 'no-address';
  listing: ListingData | null;
  source?: 'serper-domain' | 'serper-rea' | 'serper-onthehouse' | 'domain-api';
  addressSearched?: string;
  parsedAddress?: ParsedAddress;
}

/** Enrich a listing with detail actor data (non-fatal) */
async function tryEnrich(listing: ListingData): Promise<ListingData> {
  if (!listing.url || listing.description.length > 200) return listing;
  try {
    return await enrichListingDetail(listing);
  } catch (err) {
    console.error('[listing-lookup] Detail enrichment failed (non-fatal):', err instanceof Error ? err.message : err);
    return listing;
  }
}

/** Try scraping a URL via Bright Data, then Cheerio, returning the listing or null */
async function tryScrape(
  url: string,
  serperResult: SerperLookupResult,
  address: ParsedAddress,
): Promise<ListingData | null> {
  const source = serperResult.source;

  // Step A: Try Bright Data Scraping Browser (if configured)
  try {
    const { scrapeWithBrightData } = await import('../intelligence/bright-data-scraper');
    const extractor = await getExtractorForSource(source);
    const raw = await scrapeWithBrightData(url, extractor);

    if (raw) {
      const listing = buildListingFromSnippet(serperResult, address);
      const merger = await getMergerForSource(source);
      return merger(listing, raw);
    }
  } catch (err) {
    console.log(`[listing-lookup] Bright Data scrape failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // Step B: Try Cheerio scrape (fast, may be blocked, doesn't work for OTH)
  if (source !== 'onthehouse') {
    try {
      const { scrapeListing } = await import('./listing-scraper');
      console.log(`[listing-lookup] Cheerio scraping: ${url}`);
      return await scrapeListing(url);
    } catch (scrapeErr) {
      console.log(`[listing-lookup] Cheerio scrape failed: ${scrapeErr instanceof Error ? scrapeErr.message : 'unknown'}`);
    }
  }

  // Step C: Fall back to SerpAPI snippet data (instant, always works)
  return null;
}

/** Get the appropriate Playwright page extractor for a source */
async function getExtractorForSource(source: 'domain' | 'rea' | 'onthehouse') {
  if (source === 'onthehouse') {
    const { extractOnthehousePage } = await import('../intelligence/onthehouse-extractor');
    return extractOnthehousePage;
  }
  // Domain and REA use existing Cheerio parsers for now, but can be upgraded
  // to Playwright-based extractors in future
  const { extractGenericPage } = await import('../intelligence/bright-data-scraper');
  return extractGenericPage;
}

/** Get the appropriate merge function for a source */
async function getMergerForSource(source: 'domain' | 'rea' | 'onthehouse') {
  if (source === 'onthehouse') {
    const { mergeOnthehouseDetail } = await import('../intelligence/onthehouse-extractor');
    return mergeOnthehouseDetail;
  }
  if (source === 'domain') {
    const { mergeDomainDetail } = await import('../intelligence/apify-listing-detail');
    return mergeDomainDetail;
  }
  const { mergeReaDetail } = await import('../intelligence/apify-listing-detail');
  return mergeReaDetail;
}

/**
 * Build a ListingData from SerpAPI search result data (snippet + title).
 * Extracts beds, baths, parking, property type, price, land/building size
 * from the Google snippet text - no scraping needed.
 */
export function buildListingFromSnippet(
  serperResult: SerperLookupResult,
  address: ParsedAddress,
): ListingData {
  const text = `${serperResult.title} ${serperResult.snippet}`;
  const lower = text.toLowerCase();

  // Bedrooms: "3 bedroom" / "3 bed" / "3 Beds"
  const bedsMatch = text.match(/(\d+)\s*(?:bed(?:room)?s?)/i);
  // Bathrooms: "2 bathroom" / "2 bath" / "2 Bath"
  const bathsMatch = text.match(/(\d+)\s*(?:bath(?:room)?s?)/i);
  // Parking: "2 parking" / "2 car" / "2 Parking"
  const parkingMatch = text.match(/(\d+)\s*(?:parking|car)\s*(?:space)?s?/i);
  // Property type
  const propertyType = extractPropertyType(lower);
  // Land size: "589 m²" / "650sqm" / "land size of 589"
  const landMatch = text.match(/(?:land\s*(?:size|area)\s*(?:of\s*)?)?(\d[\d,]*)\s*(?:m²|sqm|sq\s*m)/i);
  // Building size: "internal building area of 70 square metres" / "70m² internal"
  const buildingMatch = text.match(/(?:internal|building|floor)\s*(?:building\s*)?(?:area|size)\s*(?:of\s*)?(\d[\d,]*)\s*(?:square\s*metres?|m²|sqm)/i);
  // Price: "$405,000" / "$750k" / "sold for $405000"
  const priceMatch = text.match(/\$[\d,]+(?:k)?/i);
  // Year built
  const yearBuiltMatch = text.match(/built\s*(?:in\s*)?(\d{4})/i);
  // Sold info from title: "Sold ... on DD Mon YYYY"
  const soldMatch = serperResult.title.match(/^Sold\s/i);

  const priceText = priceMatch ? priceMatch[0] : null;
  let priceGuide: number | null = null;
  if (priceText) {
    const cleaned = priceText.replace(/[$,]/g, '');
    if (cleaned.toLowerCase().endsWith('k')) {
      priceGuide = parseInt(cleaned.slice(0, -1), 10) * 1000 || null;
    } else {
      priceGuide = parseInt(cleaned, 10) || null;
    }
  }

  const listingType: ListingData['listingType'] = soldMatch ? 'unknown'
    : lower.includes('auction') ? 'auction'
    : lower.includes('expression') ? 'eoi'
    : priceText ? 'sale'
    : 'unknown';

  const description = serperResult.snippet;
  const images = serperResult.thumbnail ? [serperResult.thumbnail] : [];

  console.log(`[listing-lookup] Parsed snippet: ${bedsMatch?.[1] || '?'}bed/${bathsMatch?.[1] || '?'}bath/${parkingMatch?.[1] || '?'}car, ${propertyType}, ${priceText || 'no price'}`);

  return {
    source: serperResult.source,
    url: serperResult.url,
    address: formatAddressForSearch(address),
    suburb: address.suburb,
    state: address.state || '',
    postcode: address.postcode || '',
    propertyType,
    bedrooms: bedsMatch ? parseInt(bedsMatch[1], 10) : null,
    bathrooms: bathsMatch ? parseInt(bathsMatch[1], 10) : null,
    parking: parkingMatch ? parseInt(parkingMatch[1], 10) : null,
    landSize: landMatch ? parseInt(landMatch[1].replace(/,/g, ''), 10) : null,
    buildingSize: buildingMatch ? parseInt(buildingMatch[1].replace(/,/g, ''), 10) : null,
    price: priceText,
    priceGuide,
    listingType,
    auctionDate: null,
    daysOnMarket: null,
    description,
    features: yearBuiltMatch ? [`Year built: ${yearBuiltMatch[1]}`] : [],
    images,
    agentName: null,
    agencyName: null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    ...LISTING_DETAIL_DEFAULTS,
    enrichmentSource: 'serp-snippet',
    rawData: { serpapi: { title: serperResult.title, snippet: serperResult.snippet, thumbnail: serperResult.thumbnail } },
  };
}

/** Extract property type from text */
function extractPropertyType(lower: string): string {
  if (lower.includes('house')) return 'house';
  if (lower.includes('apartment')) return 'apartment';
  if (lower.includes('unit')) return 'unit';
  if (lower.includes('townhouse')) return 'townhouse';
  if (lower.includes('villa')) return 'villa';
  if (lower.includes('land') && !lower.includes('land size')) return 'land';
  if (lower.includes('studio')) return 'studio';
  if (lower.includes('duplex')) return 'duplex';
  if (lower.includes('terrace')) return 'terrace';
  return 'unknown';
}

/** Check if a Domain API search result's address matches the target */
function domainApiAddressMatches(
  result: { listing?: { propertyDetails?: { streetNumber?: string; street?: string; displayableAddress?: string } } },
  target: ParsedAddress,
): boolean {
  const prop = result.listing?.propertyDetails;
  if (!prop) return false;

  const targetNum = target.streetNumber.toLowerCase();
  const targetStreet = target.streetName.toLowerCase();

  if (prop.streetNumber && prop.street) {
    return prop.streetNumber.toLowerCase().includes(targetNum)
      && prop.street.toLowerCase().includes(targetStreet);
  }

  const display = (prop.displayableAddress || '').toLowerCase();
  return display.includes(targetNum) && display.includes(targetStreet);
}

/**
 * Look up a property listing from a user message containing an address.
 *
 * Flow:
 * 1. Extract address from message via LLM
 * 2. Primary: SerpAPI Google search -> find listing URL + snippet data (~1-2s)
 * 3. Try Bright Data scrape -> Cheerio scrape -> snippet fallback
 * 4. Fallback: Domain API search (if configured)
 */
export async function lookupListingByAddress(message: string): Promise<LookupResult> {
  // Step 1: Extract address
  const address = await extractAddressFromMessage(message);
  if (!address) {
    console.log('[listing-lookup] No address detected in message');
    return { status: 'no-address', listing: null };
  }

  const addressString = formatAddressForSearch(address);
  console.log('[listing-lookup] Address extracted:', addressString);

  // Step 2: SerpAPI Google search (searches Domain -> REA -> OTH)
  try {
    const { findListingUrlViaSerper } = await import('../intelligence/serper-lookup');
    const serperResult = await findListingUrlViaSerper(address);

    if (serperResult) {
      const foundUrl = serperResult.url;
      const foundSource = serperResult.source;

      // Step 3: Try scraping (Bright Data -> Cheerio -> snippet fallback)
      const scrapedListing = await tryScrape(foundUrl, serperResult, address);

      if (scrapedListing) {
        const listing = await tryEnrich(scrapedListing);
        const source = `serper-${foundSource}` as LookupResult['source'];
        return { status: 'found', listing, source, addressSearched: addressString, parsedAddress: address };
      }

      // All scraping failed -> use snippet data
      console.log(`[listing-lookup] All scraping failed, using SerpAPI snippet data`);
      const listing = buildListingFromSnippet(serperResult, address);
      const source = `serper-${foundSource}` as LookupResult['source'];
      return { status: 'found', listing, source, addressSearched: addressString, parsedAddress: address };
    }
  } catch (err) {
    console.error('[listing-lookup] Serper lookup failed:', err instanceof Error ? err.message : err);
  }

  // Step 4: Domain API fallback (if configured)
  const hasDomainApi = !!(process.env.DOMAIN_API_CLIENT_ID && process.env.DOMAIN_API_CLIENT_SECRET);
  if (hasDomainApi && address.suburb) {
    try {
      const { DomainApiClient } = await import('./domain-api');
      const { mapDomainSearchResultToListing } = await import('./domain-mapper');
      const domain = new DomainApiClient();

      console.log(`[listing-lookup] Searching Domain API: ${address.suburb} ${address.state || ''}`);
      const results = await domain.searchResidentialListings(address.suburb, address.state || '');

      if (results.length > 0) {
        const match = results.find(r => domainApiAddressMatches(r, address));
        if (match) {
          console.log('[listing-lookup] Found match via Domain API:', match.listing?.propertyDetails?.displayableAddress);
          let listing = mapDomainSearchResultToListing(match);
          listing = await tryEnrich(listing);
          return { status: 'found', listing, source: 'domain-api', addressSearched: addressString, parsedAddress: address };
        }
        console.log(`[listing-lookup] Domain API returned ${results.length} listings but none matched address`);
      } else {
        console.log('[listing-lookup] Domain API returned 0 listings');
      }
    } catch (err) {
      console.error('[listing-lookup] Domain API search failed:', err instanceof Error ? err.message : err);
    }
  }

  return { status: 'not-found', listing: null, addressSearched: addressString, parsedAddress: address };
}
```

**Step 4: Add `extractGenericPage` to bright-data-scraper.ts**

Add at the end of `packages/pipeline/src/pipeline/intelligence/bright-data-scraper.ts`:

```typescript
/**
 * Generic page extractor - captures __NEXT_DATA__ or ArgonautExchange.
 * Used for Domain/REA when scraped via Bright Data instead of Cheerio.
 */
export async function extractGenericPage(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    // Try Domain's __NEXT_DATA__
    const nextDataEl = document.getElementById('__NEXT_DATA__');
    if (nextDataEl?.textContent) {
      try {
        const nextData = JSON.parse(nextDataEl.textContent);
        const listing = nextData?.props?.pageProps?.listingDetails;
        if (listing) return listing;
      } catch {}
    }

    // Try REA's ArgonautExchange
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      const text = script.textContent || '';
      if (text.includes('ArgonautExchange')) {
        const match = text.match(/window\.ArgonautExchange\s*=\s*(\{[\s\S]*?\});/);
        if (match) {
          try {
            const data = JSON.parse(match[1]);
            return data.details || data;
          } catch {}
        }
      }
    }

    return {};
  });
}
```

**Step 5: Run tests**

Run: `cd packages/pipeline && npx vitest run`
Expected: All tests pass, including new OTH and Bright Data tests

**Step 6: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/listing-lookup.ts packages/pipeline/src/pipeline/extractors/listing-lookup.test.ts packages/pipeline/src/pipeline/intelligence/bright-data-scraper.ts
git commit -m "feat: integrate Bright Data scraping + OnTheHouse fallback in listing lookup"
```

---

### Task 7: Update .env.example and add Bright Data docs

**Files:**
- Modify: `packages/pipeline/.env.example`

**Step 1: Add Bright Data env var to .env.example**

Add after the Apify section:

```
# Bright Data Scraping Browser (replaces Apify for page rendering)
# Get your WebSocket endpoint from https://brightdata.com/products/scraping-browser
# Format: wss://brd-customer-XXXX-zone-scraping_browser:PASSWORD@brd.superproxy.io:9222
BRIGHT_DATA_BROWSER_WS=your_bright_data_ws_endpoint
```

**Step 2: Commit**

```bash
git add packages/pipeline/.env.example
git commit -m "docs: add Bright Data Scraping Browser env var to .env.example"
```

---

### Task 8: Run full test suite and verify feature branch

**Step 1: Run all tests**

Run: `cd packages/pipeline && npx vitest run`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `cd packages/pipeline && npx tsc --noEmit`
Expected: No type errors

**Step 3: Review the full diff**

Run: `git diff main --stat`
Expected: ~8 files changed (3 new, 5 modified)

**Step 4: Final commit if any fixups needed**

If typecheck or tests revealed issues, fix and commit.

---

## Summary of Deliverables

| File | Status | Purpose |
|------|--------|---------|
| `intelligence/bright-data-scraper.ts` | NEW | CDP client for Bright Data Scraping Browser |
| `intelligence/bright-data-scraper.test.ts` | NEW | Tests for CDP client |
| `intelligence/onthehouse-extractor.ts` | NEW | OTH page extractor + merge function |
| `intelligence/onthehouse-extractor.test.ts` | NEW | Tests for OTH extraction |
| `intelligence/serper-lookup.ts` | MODIFIED | Add OTH as third search site |
| `intelligence/serper-lookup.test.ts` | NEW | Tests for search chain order |
| `extractors/listing-types.ts` | MODIFIED | Widen source types |
| `extractors/listing-types.test.ts` | NEW | Tests for URL detection |
| `extractors/listing-lookup.ts` | MODIFIED | Route through Bright Data, handle OTH |
| `extractors/listing-lookup.test.ts` | MODIFIED | OTH + Bright Data test cases |
| `.env.example` | MODIFIED | Add BRIGHT_DATA_BROWSER_WS |
| `package.json` | MODIFIED | Add playwright-core dependency |
