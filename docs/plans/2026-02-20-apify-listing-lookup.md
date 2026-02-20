# Apify Listing Lookup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken Domain API + direct REA scraping listing lookup with Apify-powered actors that actually work.

**Architecture:** New module `apify-listing-lookup.ts` in the intelligence folder uses `ApifyClient` to search Domain/REA via Apify actors, then maps results to `ListingData`. The existing `listing-lookup.ts` is updated to call this instead of Domain API + REA scrape. Everything else stays the same.

**Tech Stack:** TypeScript, Apify REST API (via existing `ApifyClient`), vitest for tests.

**Design doc:** `docs/plans/2026-02-20-apify-listing-lookup-design.md`

---

### Task 1: Write the Apify listing lookup module tests

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/apify-listing-lookup.test.ts`

**Step 1: Write the failing tests**

Follow the same mock pattern as `vacancy-scraper.test.ts`: mock `ApifyClient` with `vi.mock` using class syntax, mock `IntelligenceCache`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunActor = vi.fn();

vi.mock('./apify-client', () => ({
  ApifyClient: class {
    runActor = mockRunActor;
  },
}));

vi.mock('./cache', () => ({
  IntelligenceCache: class {
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue(undefined);
  },
}));

import { searchListingViaApify } from './apify-listing-lookup';
import type { ParsedAddress } from '../extractors/listing-types';

const testAddress: ParsedAddress = {
  streetNumber: '71',
  streetName: 'Bridge',
  streetType: 'St',
  suburb: 'Eltham',
  state: 'VIC',
  postcode: '3095',
};

describe('searchListingViaApify', () => {
  beforeEach(() => {
    mockRunActor.mockReset();
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns listing from Domain search results', async () => {
    mockRunActor.mockResolvedValue([
      {
        url: 'https://www.domain.com.au/71-bridge-street-eltham-vic-3095-abc123',
        address: '71 Bridge Street, Eltham VIC 3095',
        price: '$850,000 - $935,000',
        bedrooms: 3,
        bathrooms: 2,
        parking: 2,
        propertyType: 'House',
        description: 'Beautiful family home',
        landSize: 650,
        agent: 'John Smith',
        agency: 'Barry Plant Eltham',
      },
    ]);

    const result = await searchListingViaApify(testAddress);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('domain');
    expect(result!.suburb).toBe('Eltham');
    expect(result!.bedrooms).toBe(3);
    expect(mockRunActor).toHaveBeenCalledTimes(1);
  });

  it('falls back to REA when Domain returns no results', async () => {
    // First call (Domain) returns empty
    mockRunActor.mockResolvedValueOnce([]);
    // Second call (REA search) returns a result
    mockRunActor.mockResolvedValueOnce([
      {
        url: 'https://www.realestate.com.au/property-house-vic-eltham-abc123',
        address: '71 Bridge St, Eltham VIC 3095',
        price: '$850,000 - $935,000',
        bedrooms: 3,
        bathrooms: 2,
        carSpaces: 2,
        propertyType: 'house',
        description: 'Beautiful family home',
      },
    ]);

    const result = await searchListingViaApify(testAddress);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('rea');
    expect(mockRunActor).toHaveBeenCalledTimes(2);
  });

  it('returns null when neither Domain nor REA has results', async () => {
    mockRunActor.mockResolvedValue([]);

    const result = await searchListingViaApify(testAddress);

    expect(result).toBeNull();
  });

  it('returns null when actor throws', async () => {
    mockRunActor.mockRejectedValue(new Error('Actor failed'));

    const result = await searchListingViaApify(testAddress);

    expect(result).toBeNull();
  });

  it('filters Domain results to match the target address', async () => {
    mockRunActor.mockResolvedValue([
      {
        url: 'https://www.domain.com.au/10-other-street-eltham-vic-3095-xyz',
        address: '10 Other Street, Eltham VIC 3095',
        price: '$500,000',
        bedrooms: 2,
        bathrooms: 1,
        propertyType: 'Unit',
      },
    ]);

    const result = await searchListingViaApify(testAddress);

    // Should not match - different street number/name
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/reidbates/dev/ilragents && npx vitest run packages/pipeline/src/pipeline/intelligence/apify-listing-lookup.test.ts`
Expected: FAIL - module `./apify-listing-lookup` not found

---

### Task 2: Implement the Apify listing lookup module

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/apify-listing-lookup.ts`

**Step 1: Write the implementation**

```typescript
import { ApifyClient } from './apify-client';
import type { ListingData, ParsedAddress } from '../extractors/listing-types';

const DOMAIN_SEARCH_ACTOR = process.env.APIFY_DOMAIN_SEARCH_ACTOR || 'fatihtahta/domain-com-au-scraper';
const REA_SEARCH_ACTOR = process.env.APIFY_REA_SEARCH_ACTOR || 'azzouzana/realestate-com-au-search-pages-scraper';

/** Parse a numeric price from display text like "$750,000", "$650,000 - $700,000" */
function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\$[\d,]+/);
  if (!match) return null;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || null;
}

/** Check if scraped result address matches the target address */
function addressMatches(scrapedAddress: string, target: ParsedAddress): boolean {
  const lower = scrapedAddress.toLowerCase();
  const targetNum = target.streetNumber.toLowerCase();
  const targetStreet = target.streetName.toLowerCase();

  return lower.includes(targetNum) && lower.includes(targetStreet);
}

/** Build a Domain.com.au search URL for a suburb */
function buildDomainSearchUrl(address: ParsedAddress): string {
  const suburb = address.suburb.toLowerCase().replace(/\s+/g, '-');
  const state = (address.state || '').toLowerCase();
  const postcode = address.postcode || '';
  return `https://www.domain.com.au/sale/${suburb}-${state}-${postcode}/`;
}

/** Build a realestate.com.au search URL for a suburb */
function buildReaSearchUrl(address: ParsedAddress): string {
  const suburb = address.suburb.toLowerCase().replace(/\s+/g, '-');
  const state = (address.state || '').toLowerCase();
  const postcode = address.postcode || '';
  let url = `https://www.realestate.com.au/buy/in-${suburb}`;
  if (state) url += `,+${state}`;
  if (postcode) url += `+${postcode}`;
  url += '/list-1';
  return url;
}

/** Map a Domain Apify scrape result to ListingData */
function mapDomainResult(raw: Record<string, unknown>): ListingData {
  const priceText = (raw.price as string) || null;
  return {
    source: 'domain',
    url: (raw.url as string) || '',
    address: (raw.address as string) || '',
    suburb: extractSuburb(raw.address as string),
    state: extractState(raw.address as string),
    postcode: extractPostcode(raw.address as string),
    propertyType: (raw.propertyType as string) || 'unknown',
    bedrooms: (raw.bedrooms as number) ?? null,
    bathrooms: (raw.bathrooms as number) ?? null,
    parking: (raw.parking as number) ?? (raw.carSpaces as number) ?? null,
    landSize: (raw.landSize as number) ?? null,
    buildingSize: (raw.buildingSize as number) ?? null,
    price: priceText,
    priceGuide: parsePrice(priceText),
    listingType: priceText?.toLowerCase().includes('auction') ? 'auction' : 'sale',
    auctionDate: (raw.auctionDate as string) || null,
    daysOnMarket: (raw.daysOnMarket as number) ?? null,
    description: (raw.description as string) || '',
    features: Array.isArray(raw.features) ? raw.features : [],
    images: Array.isArray(raw.images) ? raw.images : [],
    agentName: (raw.agent as string) || null,
    agencyName: (raw.agency as string) || null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    rawData: raw,
  };
}

/** Map a REA Apify scrape result to ListingData */
function mapReaResult(raw: Record<string, unknown>): ListingData {
  const priceText = (raw.price as string) || null;
  return {
    source: 'rea',
    url: (raw.url as string) || '',
    address: (raw.address as string) || '',
    suburb: extractSuburb(raw.address as string),
    state: extractState(raw.address as string),
    postcode: extractPostcode(raw.address as string),
    propertyType: (raw.propertyType as string) || 'unknown',
    bedrooms: (raw.bedrooms as number) ?? null,
    bathrooms: (raw.bathrooms as number) ?? null,
    parking: (raw.carSpaces as number) ?? (raw.parking as number) ?? null,
    landSize: (raw.landSize as number) ?? null,
    buildingSize: (raw.buildingSize as number) ?? null,
    price: priceText,
    priceGuide: parsePrice(priceText),
    listingType: priceText?.toLowerCase().includes('auction') ? 'auction' : 'sale',
    auctionDate: (raw.auctionDate as string) || null,
    daysOnMarket: null,
    description: (raw.description as string) || '',
    features: Array.isArray(raw.features) ? raw.features : [],
    images: Array.isArray(raw.images) ? raw.images : [],
    agentName: (raw.agent as string) || null,
    agencyName: (raw.agency as string) || null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    rawData: raw,
  };
}

/** Extract suburb from "71 Bridge St, Eltham VIC 3095" style address */
function extractSuburb(address: string | undefined): string {
  if (!address) return '';
  // Try "Suburb STATE POSTCODE" pattern after comma
  const afterComma = address.split(',').pop()?.trim() || '';
  const parts = afterComma.split(/\s+/);
  // Remove state abbreviation and postcode from end
  if (parts.length >= 3) return parts.slice(0, -2).join(' ');
  if (parts.length >= 2) return parts[0];
  return '';
}

/** Extract state from address string */
function extractState(address: string | undefined): string {
  if (!address) return '';
  const match = address.match(/\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b/i);
  return match ? match[1].toUpperCase() : '';
}

/** Extract postcode from address string */
function extractPostcode(address: string | undefined): string {
  if (!address) return '';
  const match = address.match(/\b(\d{4})\b/);
  return match ? match[1] : '';
}

/**
 * Search for a listing via Apify actors.
 * Tries Domain first, falls back to REA.
 * Returns ListingData or null if not found.
 */
export async function searchListingViaApify(address: ParsedAddress): Promise<ListingData | null> {
  try {
    const apify = new ApifyClient();

    // Try Domain first
    const domainUrl = buildDomainSearchUrl(address);
    console.log(`[apify-listing] Searching Domain: ${domainUrl}`);
    const domainResults = await apify.runActor(DOMAIN_SEARCH_ACTOR, {
      startUrls: [{ url: domainUrl }],
    }, { timeoutMs: 90000 });

    if (domainResults.length > 0) {
      const match = domainResults.find(r =>
        addressMatches((r as Record<string, unknown>).address as string || '', address)
      );
      if (match) {
        console.log('[apify-listing] Found match on Domain');
        return mapDomainResult(match as Record<string, unknown>);
      }
      console.log(`[apify-listing] Domain returned ${domainResults.length} results but none matched address`);
    } else {
      console.log('[apify-listing] Domain returned no results');
    }

    // Fall back to REA
    const reaUrl = buildReaSearchUrl(address);
    console.log(`[apify-listing] Searching REA: ${reaUrl}`);
    const reaResults = await apify.runActor(REA_SEARCH_ACTOR, {
      startUrls: [{ url: reaUrl }],
    }, { timeoutMs: 90000 });

    if (reaResults.length > 0) {
      const match = reaResults.find(r =>
        addressMatches((r as Record<string, unknown>).address as string || '', address)
      );
      if (match) {
        console.log('[apify-listing] Found match on REA');
        return mapReaResult(match as Record<string, unknown>);
      }
      console.log(`[apify-listing] REA returned ${reaResults.length} results but none matched address`);
    } else {
      console.log('[apify-listing] REA returned no results');
    }

    return null;
  } catch (err) {
    console.error('[apify-listing] Search failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
```

**Step 2: Run tests to verify they pass**

Run: `cd /Users/reidbates/dev/ilragents && npx vitest run packages/pipeline/src/pipeline/intelligence/apify-listing-lookup.test.ts`
Expected: All 5 tests PASS

**Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/apify-listing-lookup.ts packages/pipeline/src/pipeline/intelligence/apify-listing-lookup.test.ts
git commit -m "feat: add Apify-powered listing lookup with Domain and REA fallback"
```

---

### Task 3: Update listing-lookup.ts to use Apify instead of Domain API + REA

**Files:**
- Modify: `packages/pipeline/src/pipeline/extractors/listing-lookup.ts`

**Step 1: Replace the implementation**

Replace the entire file. The key changes:
- Remove `DomainApiClient`, `DomainSearchResult`, `mapDomainSearchResultToListing`, `searchReaByAddress` imports
- Remove `matchesAddress` helper (address matching now lives in `apify-listing-lookup.ts`)
- Import `searchListingViaApify` from `../intelligence/apify-listing-lookup`
- Update `LookupResult.source` type to include `'apify-domain' | 'apify-rea'`
- Simplify the lookup flow: extract address -> call Apify search -> return result

New contents of `listing-lookup.ts`:

```typescript
import type { ListingData, ParsedAddress } from './listing-types';
import { formatAddressForSearch } from './listing-types';
import { extractAddressFromMessage } from './address-extractor';
import { searchListingViaApify } from '../intelligence/apify-listing-lookup';

export interface LookupResult {
  status: 'found' | 'not-found' | 'no-address';
  listing: ListingData | null;
  source?: 'apify-domain' | 'apify-rea';
  addressSearched?: string;
  parsedAddress?: ParsedAddress;
}

/**
 * Look up a property listing from a user message containing an address.
 *
 * Flow:
 * 1. Extract address from message via LLM
 * 2. Search Domain via Apify actor
 * 3. Fall back to REA via Apify actor
 * 4. Return result with status
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

  // Step 2: Search via Apify (Domain then REA fallback)
  try {
    const listing = await searchListingViaApify(address);
    if (listing) {
      const source = listing.source === 'domain' ? 'apify-domain' : 'apify-rea';
      console.log(`[listing-lookup] Found listing via ${source}:`, listing.address);
      return { status: 'found', listing, source, addressSearched: addressString, parsedAddress: address };
    }
    console.log('[listing-lookup] No listing found via Apify');
  } catch (err) {
    console.error('[listing-lookup] Apify search failed:', err instanceof Error ? err.message : err);
  }

  // Step 3: Not found
  return { status: 'not-found', listing: null, addressSearched: addressString, parsedAddress: address };
}
```

**Step 2: Run existing listing-lookup tests (they will fail - that's expected)**

Run: `cd /Users/reidbates/dev/ilragents && npx vitest run packages/pipeline/src/pipeline/extractors/listing-lookup.test.ts`
Expected: FAIL - old mocks reference removed imports

---

### Task 4: Update listing-lookup tests for the new Apify-based implementation

**Files:**
- Modify: `packages/pipeline/src/pipeline/extractors/listing-lookup.test.ts`

**Step 1: Rewrite the tests**

Replace the entire file. Mocks change from Domain API + REA scrape to `searchListingViaApify`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchApify = vi.fn();

vi.mock('./address-extractor', () => ({
  extractAddressFromMessage: vi.fn(),
}));

vi.mock('../intelligence/apify-listing-lookup', () => ({
  searchListingViaApify: (...args: unknown[]) => mockSearchApify(...args),
}));

import { lookupListingByAddress } from './listing-lookup';
import { extractAddressFromMessage } from './address-extractor';

const mockExtract = vi.mocked(extractAddressFromMessage);

describe('lookupListingByAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    mockSearchApify.mockResolvedValue(null);
  });

  it('returns no-address when no address detected', async () => {
    mockExtract.mockResolvedValue(null);

    const result = await lookupListingByAddress('how do I invest?');

    expect(result.status).toBe('no-address');
    expect(result.listing).toBeNull();
  });

  it('returns listing when Apify finds a Domain match', async () => {
    const addr = { streetNumber: '71', streetName: 'Bridge', streetType: 'St', suburb: 'Eltham', state: 'VIC', postcode: '3095' };
    mockExtract.mockResolvedValue(addr);

    const fakeListing = { source: 'domain' as const, address: '71 Bridge St, Eltham VIC 3095', suburb: 'Eltham' } as any;
    mockSearchApify.mockResolvedValue(fakeListing);

    const result = await lookupListingByAddress('What about 71 Bridge St Eltham');

    expect(result.status).toBe('found');
    expect(result.listing).toBe(fakeListing);
    expect(result.source).toBe('apify-domain');
    expect(result.parsedAddress).toEqual(addr);
  });

  it('returns listing when Apify finds a REA match', async () => {
    const addr = { streetNumber: '71', streetName: 'Bridge', suburb: 'Eltham' };
    mockExtract.mockResolvedValue(addr);

    const fakeListing = { source: 'rea' as const, address: '71 Bridge St' } as any;
    mockSearchApify.mockResolvedValue(fakeListing);

    const result = await lookupListingByAddress('71 Bridge St Eltham');

    expect(result.status).toBe('found');
    expect(result.source).toBe('apify-rea');
  });

  it('returns not-found when Apify returns null', async () => {
    const addr = { streetNumber: '71', streetName: 'Bridge', suburb: 'Eltham' };
    mockExtract.mockResolvedValue(addr);
    mockSearchApify.mockResolvedValue(null);

    const result = await lookupListingByAddress('71 Bridge St Eltham');

    expect(result.status).toBe('not-found');
    expect(result.listing).toBeNull();
    expect(result.addressSearched).toBeDefined();
  });

  it('returns not-found when Apify throws', async () => {
    const addr = { streetNumber: '71', streetName: 'Bridge', suburb: 'Eltham' };
    mockExtract.mockResolvedValue(addr);
    mockSearchApify.mockRejectedValue(new Error('Apify down'));

    const result = await lookupListingByAddress('71 Bridge St Eltham');

    expect(result.status).toBe('not-found');
    expect(result.listing).toBeNull();
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd /Users/reidbates/dev/ilragents && npx vitest run packages/pipeline/src/pipeline/extractors/listing-lookup.test.ts`
Expected: All 5 tests PASS

**Step 3: Run all tests to check nothing else broke**

Run: `cd /Users/reidbates/dev/ilragents && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/listing-lookup.ts packages/pipeline/src/pipeline/extractors/listing-lookup.test.ts
git commit -m "refactor: replace Domain API + REA scrape with Apify listing lookup"
```

---

### Task 5: Update the chat route to handle new source types

**Files:**
- Modify: `packages/web/src/app/api/chat/stream/route.ts`

**Step 1: Check if route references `source` field**

The route at `packages/web/src/app/api/chat/stream/route.ts` does not use `LookupResult.source` for any logic - it only checks `lookupResult.status`. No changes needed to the route itself.

Verify by reading the file and confirming `source` is not referenced outside of the type definition.

**Step 2: Update the `ListingData.source` type to allow Apify sources**

The `ListingData` interface in `listing-types.ts` has `source: 'domain' | 'rea'`. The Apify lookup still returns `'domain'` or `'rea'` based on which site the data came from, so no change needed here either.

**Step 3: Export the new module from the intelligence barrel**

Modify `packages/pipeline/src/pipeline/intelligence/index.ts` to add:

```typescript
export { searchListingViaApify } from './apify-listing-lookup';
```

**Step 4: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/index.ts
git commit -m "feat: export searchListingViaApify from intelligence barrel"
```

---

### Task 6: Add env var docs and run final verification

**Files:**
- Modify: `packages/pipeline/.env.example`

**Step 1: Add Apify actor env vars to .env.example**

Add the following lines to the existing `.env.example`, under the existing `APIFY_API_TOKEN` line:

```
# Apify actor overrides (defaults are built-in, only set to use custom actors)
# APIFY_DOMAIN_SEARCH_ACTOR=fatihtahta/domain-com-au-scraper
# APIFY_REA_SEARCH_ACTOR=azzouzana/realestate-com-au-search-pages-scraper
```

**Step 2: Run all tests**

Run: `cd /Users/reidbates/dev/ilragents && npx vitest run`
Expected: All tests PASS

**Step 3: Run typecheck**

Run: `cd /Users/reidbates/dev/ilragents/packages/pipeline && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/pipeline/.env.example
git commit -m "docs: add Apify listing actor env vars to .env.example"
```
