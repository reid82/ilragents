# Address-Based Listing Lookup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Deal Analyser Dan and FISO Phil to look up property listings from street addresses using Domain API + REA scrape fallback.

**Architecture:** LLM-powered address extraction (Claude Haiku via OpenRouter) feeds into Domain.com.au official API for listing lookup, with REA search page scraping as fallback. All results map to the existing `ListingData` interface and inject into the agent system prompt via the existing `buildListingDataBlock()` function.

**Tech Stack:** TypeScript, Vitest, OpenAI SDK (via OpenRouter), Domain.com.au OAuth2 API, Cheerio (HTML parsing), Next.js API route

**Design doc:** `docs/plans/2026-02-18-address-based-listing-lookup-design.md`

---

## Task 1: Add ParsedAddress type and address-related exports

**Files:**
- Modify: `packages/pipeline/src/pipeline/extractors/listing-types.ts`
- Modify: `packages/pipeline/package.json`

**Step 1: Add ParsedAddress interface to listing-types.ts**

Add after the `ScrapeResult` interface (after line 61):

```typescript
/** Structured Australian address extracted from user message */
export interface ParsedAddress {
  streetNumber: string;
  streetName: string;
  streetType?: string;
  unitNumber?: string;
  suburb: string;
  state?: string;
  postcode?: string;
}
```

**Step 2: Add a helper to format ParsedAddress as a search string**

Add after the new interface:

```typescript
/** Format a parsed address into a single-line search string */
export function formatAddressForSearch(addr: ParsedAddress): string {
  const parts: string[] = [];
  if (addr.unitNumber) parts.push(`${addr.unitNumber}/`);
  parts.push(addr.streetNumber);
  parts.push(addr.streetName);
  if (addr.streetType) parts.push(addr.streetType);
  parts.push(addr.suburb);
  if (addr.state) parts.push(addr.state);
  if (addr.postcode) parts.push(addr.postcode);
  return parts.join(' ').replace('/ ', '/');
}
```

**Step 3: Add new package exports to pipeline package.json**

Add these exports to the `"exports"` object:

```json
"./address-extractor": "./src/pipeline/extractors/address-extractor.ts",
"./domain-api": "./src/pipeline/extractors/domain-api.ts"
```

**Step 4: Run typecheck**

Run: `npm -w @ilre/pipeline run typecheck`
Expected: PASS (no errors)

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/listing-types.ts packages/pipeline/package.json
git commit -m "feat: add ParsedAddress type and pipeline exports for address lookup"
```

---

## Task 2: LLM Address Extractor

**Files:**
- Create: `packages/pipeline/src/pipeline/extractors/address-extractor.ts`
- Create: `packages/pipeline/src/pipeline/extractors/address-extractor.test.ts`

**Step 1: Write the failing tests**

Create `address-extractor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock OpenAI
const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockCreate } };
  },
}));

import { extractAddressFromMessage } from './address-extractor';

describe('extractAddressFromMessage', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    mockCreate.mockReset();
  });

  it('extracts a full address from natural text', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            streetNumber: '42',
            streetName: 'Smith',
            streetType: 'St',
            suburb: 'Richmond',
            state: 'VIC',
            postcode: '3121',
          }),
        },
      }],
    });

    const result = await extractAddressFromMessage('What do you think of 42 Smith St, Richmond VIC 3121?');
    expect(result).toEqual({
      streetNumber: '42',
      streetName: 'Smith',
      streetType: 'St',
      suburb: 'Richmond',
      state: 'VIC',
      postcode: '3121',
    });
  });

  it('extracts a unit address', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            unitNumber: '3',
            streetNumber: '15',
            streetName: 'Main',
            streetType: 'Rd',
            suburb: 'Heidelberg',
            state: 'VIC',
            postcode: '3084',
          }),
        },
      }],
    });

    const result = await extractAddressFromMessage('Unit 3/15 Main Rd Heidelberg VIC 3084');
    expect(result).toEqual({
      unitNumber: '3',
      streetNumber: '15',
      streetName: 'Main',
      streetType: 'Rd',
      suburb: 'Heidelberg',
      state: 'VIC',
      postcode: '3084',
    });
  });

  it('returns null when no address is found', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { content: 'null' },
      }],
    });

    const result = await extractAddressFromMessage('What is the best strategy for investing?');
    expect(result).toBeNull();
  });

  it('returns null on LLM error', async () => {
    mockCreate.mockRejectedValue(new Error('API down'));
    const result = await extractAddressFromMessage('42 Smith St Richmond');
    expect(result).toBeNull();
  });

  it('returns null on invalid JSON from LLM', async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { content: 'I found an address at 42 Smith St' },
      }],
    });

    const result = await extractAddressFromMessage('42 Smith St Richmond');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm -w @ilre/pipeline run test -- --run src/pipeline/extractors/address-extractor.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement the address extractor**

Create `address-extractor.ts`:

```typescript
import OpenAI from 'openai';
import type { ParsedAddress } from './listing-types';

const ADDRESS_MODEL = 'anthropic/claude-haiku-4-5-20251001';

const EXTRACTION_PROMPT = `You are an Australian address extraction tool. Given a user message, extract any Australian property address mentioned.

Return ONLY a JSON object with these fields (omit fields you can't determine):
- streetNumber (required): e.g. "42"
- streetName (required): e.g. "Smith"
- streetType (optional): e.g. "St", "Street", "Rd", "Road", "Ave", "Cres", "Pl", "Dr", "Ct"
- unitNumber (optional): e.g. "3" from "Unit 3/15" or "3/15"
- suburb (required): e.g. "Richmond"
- state (optional): e.g. "VIC", "NSW", "QLD", "SA", "WA", "TAS", "NT", "ACT"
- postcode (optional): e.g. "3121"

If no Australian property address is present, return the literal text: null

Examples:
- "what do you think of 42 Smith St, Richmond VIC 3121" -> {"streetNumber":"42","streetName":"Smith","streetType":"St","suburb":"Richmond","state":"VIC","postcode":"3121"}
- "that place at 15 Main in Heidelberg" -> {"streetNumber":"15","streetName":"Main","suburb":"Heidelberg"}
- "how do I calculate yield?" -> null

Return ONLY the JSON object or null. No explanation.`;

function getClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://ilragents.app',
      'X-Title': 'ILRE Address Extraction',
    },
  });
}

/**
 * Extract a structured Australian address from a user message using LLM.
 * Returns null if no address is found or on any error.
 */
export async function extractAddressFromMessage(message: string): Promise<ParsedAddress | null> {
  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: ADDRESS_MODEL,
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: message },
      ],
      temperature: 0,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content || content === 'null') return null;

    const parsed = JSON.parse(content);
    if (!parsed || !parsed.streetNumber || !parsed.streetName || !parsed.suburb) return null;

    return parsed as ParsedAddress;
  } catch {
    return null;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm -w @ilre/pipeline run test -- --run src/pipeline/extractors/address-extractor.test.ts`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/address-extractor.ts packages/pipeline/src/pipeline/extractors/address-extractor.test.ts
git commit -m "feat: add LLM-powered address extraction from user messages"
```

---

## Task 3: Domain API Client

**Files:**
- Create: `packages/pipeline/src/pipeline/extractors/domain-api.ts`
- Create: `packages/pipeline/src/pipeline/extractors/domain-api.test.ts`

**Step 1: Write the failing tests**

Create `domain-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { DomainApiClient } from './domain-api';

describe('DomainApiClient', () => {
  let client: DomainApiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('DOMAIN_API_CLIENT_ID', 'test-id');
    vi.stubEnv('DOMAIN_API_CLIENT_SECRET', 'test-secret');
    client = new DomainApiClient();
  });

  describe('authenticate', () => {
    it('fetches an OAuth token on first call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: '1', address: '42 Smith St' }]),
      });

      await client.suggestProperties('42 Smith St Richmond');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // First call is auth
      expect(mockFetch.mock.calls[0][0]).toBe('https://auth.domain.com.au/v1/connect/token');
    });

    it('reuses cached token on second call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await client.suggestProperties('query 1');
      await client.suggestProperties('query 2');

      // 1 auth + 2 API calls = 3
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('suggestProperties', () => {
    it('calls the properties/_suggest endpoint with terms', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: 'prop-1', address: '42 Smith St, Richmond VIC 3121', propertyType: 'house' },
        ]),
      });

      const results = await client.suggestProperties('42 Smith St Richmond');

      const suggestCall = mockFetch.mock.calls[1];
      expect(suggestCall[0]).toContain('api.domain.com.au/v1/properties/_suggest');
      expect(suggestCall[0]).toContain('terms=42+Smith+St+Richmond');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('prop-1');
    });
  });

  describe('searchResidentialListings', () => {
    it('POSTs to the residential search endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { id: 12345, type: 'PropertyListing', listing: { listingType: 'Sale' } },
        ]),
      });

      const results = await client.searchResidentialListings('Richmond', 'VIC');

      const searchCall = mockFetch.mock.calls[1];
      expect(searchCall[0]).toBe('https://api.domain.com.au/v1/listings/residential/_search');
      expect(searchCall[1].method).toBe('POST');
      const body = JSON.parse(searchCall[1].body);
      expect(body.listingType).toBe('Sale');
      expect(body.locations[0].suburb).toBe('Richmond');
      expect(body.locations[0].state).toBe('VIC');
    });
  });

  describe('getListing', () => {
    it('fetches a single listing by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 12345, headline: 'Beautiful Home' }),
      });

      const result = await client.getListing(12345);

      const listingCall = mockFetch.mock.calls[1];
      expect(listingCall[0]).toBe('https://api.domain.com.au/v1/listings/12345');
      expect(result.headline).toBe('Beautiful Home');
    });
  });

  describe('error handling', () => {
    it('throws on auth failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(client.suggestProperties('test')).rejects.toThrow('Domain API auth failed');
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok-123', expires_in: 43200 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.suggestProperties('test')).rejects.toThrow('HTTP 500');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm -w @ilre/pipeline run test -- --run src/pipeline/extractors/domain-api.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement the Domain API client**

Create `domain-api.ts`:

```typescript
const AUTH_URL = 'https://auth.domain.com.au/v1/connect/token';
const API_BASE = 'https://api.domain.com.au/v1';

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class DomainApiClient {
  private tokenCache: TokenCache | null = null;

  private async getToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const clientId = process.env.DOMAIN_API_CLIENT_ID;
    const clientSecret = process.env.DOMAIN_API_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('DOMAIN_API_CLIENT_ID and DOMAIN_API_CLIENT_SECRET are required');
    }

    const response = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'api_listings_read api_properties_read',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Domain API auth failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh 60s early
    };

    return this.tokenCache.token;
  }

  private async apiGet(path: string, params?: Record<string, string>): Promise<unknown> {
    const token = await this.getToken();
    const url = new URL(`${API_BASE}/${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async apiPost(path: string, body: unknown): Promise<unknown> {
    const token = await this.getToken();

    const response = await fetch(`${API_BASE}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /** Search for property suggestions by address terms */
  async suggestProperties(terms: string): Promise<DomainPropertySuggestion[]> {
    const result = await this.apiGet('properties/_suggest', {
      terms,
      channel: 'Residential',
      pageSize: '5',
    });
    return (result as DomainPropertySuggestion[]) || [];
  }

  /** Search active residential sale listings by suburb */
  async searchResidentialListings(suburb: string, state: string): Promise<DomainSearchResult[]> {
    const result = await this.apiPost('listings/residential/_search', {
      listingType: 'Sale',
      locations: [{ suburb, state }],
      pageSize: 25,
    });
    return (result as DomainSearchResult[]) || [];
  }

  /** Get full details for a single listing */
  async getListing(id: number): Promise<Record<string, unknown>> {
    return (await this.apiGet(`listings/${id}`)) as Record<string, unknown>;
  }
}

// Domain API response types (subset of what they return)
export interface DomainPropertySuggestion {
  id: string;
  address?: string;
  addressComponents?: {
    streetNumber?: string;
    streetName?: string;
    streetType?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
  };
  propertyType?: string;
  [key: string]: unknown;
}

export interface DomainSearchResult {
  type: string;
  listing?: {
    id: number;
    listingType: string;
    propertyDetails?: {
      displayableAddress?: string;
      suburb?: string;
      state?: string;
      postcode?: string;
      streetNumber?: string;
      street?: string;
      propertyType?: string;
      bedrooms?: number;
      bathrooms?: number;
      carspaces?: number;
      landArea?: number;
      buildingArea?: number;
      features?: string[];
    };
    priceDetails?: {
      displayPrice?: string;
      price?: number;
    };
    media?: { url?: string }[];
    advertiser?: {
      name?: string;
      contacts?: { name?: string }[];
    };
    headline?: string;
    summaryDescription?: string;
    auctionSchedule?: { time?: string };
    dateListed?: string;
  };
  [key: string]: unknown;
}
```

**Step 4: Run tests to verify they pass**

Run: `npm -w @ilre/pipeline run test -- --run src/pipeline/extractors/domain-api.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/domain-api.ts packages/pipeline/src/pipeline/extractors/domain-api.test.ts
git commit -m "feat: add Domain.com.au API client with OAuth and listing search"
```

---

## Task 4: Domain API to ListingData mapper

**Files:**
- Create: `packages/pipeline/src/pipeline/extractors/domain-mapper.ts`
- Create: `packages/pipeline/src/pipeline/extractors/domain-mapper.test.ts`

**Step 1: Write the failing tests**

Create `domain-mapper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mapDomainSearchResultToListing } from './domain-mapper';
import type { DomainSearchResult } from './domain-api';

describe('mapDomainSearchResultToListing', () => {
  const fullResult: DomainSearchResult = {
    type: 'PropertyListing',
    listing: {
      id: 12345,
      listingType: 'Sale',
      propertyDetails: {
        displayableAddress: '42 Smith St, Richmond VIC 3121',
        suburb: 'Richmond',
        state: 'VIC',
        postcode: '3121',
        streetNumber: '42',
        street: 'Smith St',
        propertyType: 'House',
        bedrooms: 3,
        bathrooms: 2,
        carspaces: 1,
        landArea: 450,
        buildingArea: 180,
        features: ['Air Conditioning', 'Garage'],
      },
      priceDetails: {
        displayPrice: '$750,000 - $800,000',
        price: 750000,
      },
      media: [
        { url: 'https://img.domain.com.au/photo1.jpg' },
        { url: 'https://img.domain.com.au/photo2.jpg' },
      ],
      advertiser: {
        name: 'Top Agency',
        contacts: [{ name: 'Jane Agent' }],
      },
      headline: 'Beautiful Family Home',
      summaryDescription: 'A lovely 3 bed home in the heart of Richmond.',
      auctionSchedule: { time: '2026-03-01T10:00:00' },
      dateListed: '2026-01-15',
    },
  };

  it('maps all property details correctly', () => {
    const listing = mapDomainSearchResultToListing(fullResult);
    expect(listing.source).toBe('domain');
    expect(listing.address).toBe('42 Smith St, Richmond VIC 3121');
    expect(listing.suburb).toBe('Richmond');
    expect(listing.state).toBe('VIC');
    expect(listing.postcode).toBe('3121');
    expect(listing.propertyType).toBe('House');
    expect(listing.bedrooms).toBe(3);
    expect(listing.bathrooms).toBe(2);
    expect(listing.parking).toBe(1);
    expect(listing.landSize).toBe(450);
    expect(listing.buildingSize).toBe(180);
  });

  it('maps price details', () => {
    const listing = mapDomainSearchResultToListing(fullResult);
    expect(listing.price).toBe('$750,000 - $800,000');
    expect(listing.priceGuide).toBe(750000);
  });

  it('maps listing type', () => {
    const sale = mapDomainSearchResultToListing(fullResult);
    expect(sale.listingType).toBe('sale');

    const auction = mapDomainSearchResultToListing({
      ...fullResult,
      listing: { ...fullResult.listing!, listingType: 'Auction' },
    });
    expect(auction.listingType).toBe('auction');
  });

  it('maps agent info', () => {
    const listing = mapDomainSearchResultToListing(fullResult);
    expect(listing.agentName).toBe('Jane Agent');
    expect(listing.agencyName).toBe('Top Agency');
  });

  it('maps description and images', () => {
    const listing = mapDomainSearchResultToListing(fullResult);
    expect(listing.description).toContain('lovely');
    expect(listing.images).toHaveLength(2);
  });

  it('handles missing optional fields gracefully', () => {
    const minimal: DomainSearchResult = {
      type: 'PropertyListing',
      listing: {
        id: 99,
        listingType: 'Sale',
        propertyDetails: {
          displayableAddress: '1 Test St, TestSuburb NSW 2000',
          suburb: 'TestSuburb',
          state: 'NSW',
          postcode: '2000',
        },
      },
    };

    const listing = mapDomainSearchResultToListing(minimal);
    expect(listing.bedrooms).toBeNull();
    expect(listing.price).toBeNull();
    expect(listing.agentName).toBeNull();
    expect(listing.description).toBe('');
    expect(listing.images).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm -w @ilre/pipeline run test -- --run src/pipeline/extractors/domain-mapper.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement the mapper**

Create `domain-mapper.ts`:

```typescript
import type { ListingData } from './listing-types';
import type { DomainSearchResult } from './domain-api';

/** Parse a numeric price from display text like "$750,000 - $800,000" */
function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/\$[\d,]+/);
  if (!match) return null;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || null;
}

function mapListingType(type: string): ListingData['listingType'] {
  const lower = type.toLowerCase();
  if (lower === 'auction') return 'auction';
  if (lower === 'sale') return 'sale';
  if (lower.includes('expression')) return 'eoi';
  return 'unknown';
}

/** Map a Domain API search result to our standard ListingData interface */
export function mapDomainSearchResultToListing(result: DomainSearchResult): ListingData {
  const listing = result.listing;
  const prop = listing?.propertyDetails;
  const price = listing?.priceDetails;
  const advertiser = listing?.advertiser;
  const contacts = advertiser?.contacts || [];

  const displayPrice = price?.displayPrice || null;

  return {
    source: 'domain',
    url: listing?.id ? `https://www.domain.com.au/listing/${listing.id}` : '',
    address: prop?.displayableAddress || '',
    suburb: prop?.suburb || '',
    state: prop?.state || '',
    postcode: prop?.postcode || '',
    propertyType: prop?.propertyType || 'unknown',
    bedrooms: prop?.bedrooms ?? null,
    bathrooms: prop?.bathrooms ?? null,
    parking: prop?.carspaces ?? null,
    landSize: prop?.landArea ?? null,
    buildingSize: prop?.buildingArea ?? null,
    price: displayPrice,
    priceGuide: price?.price ?? parsePrice(displayPrice),
    listingType: mapListingType(listing?.listingType || ''),
    auctionDate: listing?.auctionSchedule?.time || null,
    daysOnMarket: null, // not provided in search results
    description: listing?.summaryDescription || listing?.headline || '',
    features: prop?.features || [],
    images: (listing?.media || []).map(m => m.url).filter(Boolean) as string[],
    agentName: contacts[0]?.name || null,
    agencyName: advertiser?.name || null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    rawData: result as unknown as Record<string, unknown>,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm -w @ilre/pipeline run test -- --run src/pipeline/extractors/domain-mapper.test.ts`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/domain-mapper.ts packages/pipeline/src/pipeline/extractors/domain-mapper.test.ts
git commit -m "feat: add Domain API to ListingData mapper"
```

---

## Task 5: REA Search Fallback

**Files:**
- Modify: `packages/pipeline/src/pipeline/extractors/listing-scraper.ts`
- Modify: `packages/pipeline/src/pipeline/extractors/listing-scraper.test.ts`

**Step 1: Write the failing tests**

Add to `listing-scraper.test.ts`:

```typescript
import { searchReaByAddress } from './listing-scraper';
import type { ParsedAddress } from './listing-types';

describe('searchReaByAddress', () => {
  it('builds the correct REA search URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<html><body>No results</body></html>'),
    } as Response);

    const addr: ParsedAddress = {
      streetNumber: '42',
      streetName: 'Smith',
      streetType: 'St',
      suburb: 'Richmond',
      state: 'VIC',
      postcode: '3121',
    };

    await searchReaByAddress(addr);

    expect(fetchSpy.mock.calls[0][0]).toContain('realestate.com.au/buy/in-richmond');
    fetchSpy.mockRestore();
  });

  it('returns null when no matching listing is found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('<html><body>No results found</body></html>'),
    } as Response);

    const result = await searchReaByAddress({
      streetNumber: '999',
      streetName: 'Nonexistent',
      suburb: 'Nowhere',
    });

    expect(result).toBeNull();
    vi.restoreAllMocks();
  });

  it('returns null on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await searchReaByAddress({
      streetNumber: '42',
      streetName: 'Smith',
      suburb: 'Richmond',
    });

    expect(result).toBeNull();
    vi.restoreAllMocks();
  });
});
```

**Step 2: Run tests to verify new tests fail**

Run: `npm -w @ilre/pipeline run test -- --run src/pipeline/extractors/listing-scraper.test.ts`
Expected: FAIL (searchReaByAddress not exported)

**Step 3: Implement searchReaByAddress**

Add to the bottom of `listing-scraper.ts`, before the closing of the file. Note: `fetchHtml` is already defined in this file (private function at the top).

```typescript
import * as cheerio from 'cheerio';
import type { ListingData } from './listing-types';
import type { ParsedAddress } from './listing-types';

// ... existing code ...

/**
 * Search realestate.com.au for a listing matching the given address.
 * Returns the first matching ListingData or null.
 */
export async function searchReaByAddress(address: ParsedAddress): Promise<ListingData | null> {
  try {
    const suburb = address.suburb.toLowerCase().replace(/\s+/g, '-');
    const state = address.state?.toLowerCase() || '';
    const postcode = address.postcode || '';

    let searchUrl = `https://www.realestate.com.au/buy/in-${suburb}`;
    if (state) searchUrl += `,+${state}`;
    if (postcode) searchUrl += `+${postcode}`;
    searchUrl += '/list-1';

    const html = await fetchHtml(searchUrl);
    const $ = cheerio.load(html);

    // REA search results contain listing cards with links to individual listings
    // Look for links matching the street address
    const streetSearch = `${address.streetNumber} ${address.streetName}`.toLowerCase();
    let matchedUrl: string | null = null;

    $('a[href*="/property-"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().toLowerCase();
      const hrefLower = href.toLowerCase();

      if (text.includes(streetSearch) || hrefLower.includes(streetSearch.replace(/\s+/g, '-'))) {
        matchedUrl = href.startsWith('http')
          ? href
          : `https://www.realestate.com.au${href}`;
        return false; // break
      }
    });

    if (!matchedUrl) return null;

    // Scrape the matched listing using existing parser
    const listingHtml = await fetchHtml(matchedUrl);
    return parseReaListing(listingHtml, matchedUrl);
  } catch {
    return null;
  }
}
```

Note: The import of `ParsedAddress` needs to be added to the existing import from `./listing-types`. Update the import line at the top of the file:

```typescript
import type { ListingData, ParsedAddress } from './listing-types';
```

**Step 4: Run tests to verify they pass**

Run: `npm -w @ilre/pipeline run test -- --run src/pipeline/extractors/listing-scraper.test.ts`
Expected: PASS (all tests, including existing ones)

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/listing-scraper.ts packages/pipeline/src/pipeline/extractors/listing-scraper.test.ts
git commit -m "feat: add REA search-by-address fallback to listing scraper"
```

---

## Task 6: Listing Lookup Orchestrator

**Files:**
- Create: `packages/pipeline/src/pipeline/extractors/listing-lookup.ts`
- Create: `packages/pipeline/src/pipeline/extractors/listing-lookup.test.ts`
- Modify: `packages/pipeline/package.json` (add export)

**Step 1: Write the failing tests**

Create `listing-lookup.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('./address-extractor', () => ({
  extractAddressFromMessage: vi.fn(),
}));

vi.mock('./domain-api', () => ({
  DomainApiClient: vi.fn().mockImplementation(() => ({
    searchResidentialListings: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('./domain-mapper', () => ({
  mapDomainSearchResultToListing: vi.fn(),
}));

vi.mock('./listing-scraper', () => ({
  searchReaByAddress: vi.fn().mockResolvedValue(null),
}));

import { lookupListingByAddress, type LookupResult } from './listing-lookup';
import { extractAddressFromMessage } from './address-extractor';
import { DomainApiClient } from './domain-api';
import { mapDomainSearchResultToListing } from './domain-mapper';
import { searchReaByAddress } from './listing-scraper';

const mockExtract = vi.mocked(extractAddressFromMessage);
const mockSearchRea = vi.mocked(searchReaByAddress);
const mockMapDomain = vi.mocked(mapDomainSearchResultToListing);

describe('lookupListingByAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DOMAIN_API_CLIENT_ID', 'test-id');
    vi.stubEnv('DOMAIN_API_CLIENT_SECRET', 'test-secret');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
  });

  it('returns not-found when no address detected', async () => {
    mockExtract.mockResolvedValue(null);

    const result = await lookupListingByAddress('how do I invest?');

    expect(result.status).toBe('no-address');
    expect(result.listing).toBeNull();
  });

  it('returns listing from Domain API when found', async () => {
    const addr = { streetNumber: '42', streetName: 'Smith', streetType: 'St', suburb: 'Richmond', state: 'VIC', postcode: '3121' };
    mockExtract.mockResolvedValue(addr);

    const fakeListing = { source: 'domain' as const, address: '42 Smith St', suburb: 'Richmond' } as any;
    const fakeSearchResult = {
      type: 'PropertyListing',
      listing: {
        id: 123,
        listingType: 'Sale',
        propertyDetails: { displayableAddress: '42 Smith St, Richmond VIC 3121', streetNumber: '42', street: 'Smith St', suburb: 'Richmond', state: 'VIC', postcode: '3121' },
      },
    };

    // Override the mock for this test
    const mockSearch = vi.fn().mockResolvedValue([fakeSearchResult]);
    (DomainApiClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      searchResidentialListings: mockSearch,
    }));
    mockMapDomain.mockReturnValue(fakeListing);

    const result = await lookupListingByAddress('What about 42 Smith St Richmond VIC 3121');

    expect(result.status).toBe('found');
    expect(result.listing).toBe(fakeListing);
    expect(result.source).toBe('domain-api');
  });

  it('falls back to REA when Domain returns no match', async () => {
    const addr = { streetNumber: '42', streetName: 'Smith', suburb: 'Richmond' };
    mockExtract.mockResolvedValue(addr);

    const mockSearch = vi.fn().mockResolvedValue([]);
    (DomainApiClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      searchResidentialListings: mockSearch,
    }));

    const reaListing = { source: 'rea' as const, address: '42 Smith St' } as any;
    mockSearchRea.mockResolvedValue(reaListing);

    const result = await lookupListingByAddress('42 Smith St Richmond');

    expect(result.status).toBe('found');
    expect(result.listing).toBe(reaListing);
    expect(result.source).toBe('rea-scrape');
  });

  it('returns not-found when neither Domain nor REA has listing', async () => {
    const addr = { streetNumber: '42', streetName: 'Smith', suburb: 'Richmond' };
    mockExtract.mockResolvedValue(addr);

    const mockSearch = vi.fn().mockResolvedValue([]);
    (DomainApiClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      searchResidentialListings: mockSearch,
    }));
    mockSearchRea.mockResolvedValue(null);

    const result = await lookupListingByAddress('42 Smith St Richmond');

    expect(result.status).toBe('not-found');
    expect(result.listing).toBeNull();
    expect(result.addressSearched).toBeDefined();
  });

  it('falls back to REA when Domain API throws', async () => {
    const addr = { streetNumber: '42', streetName: 'Smith', suburb: 'Richmond' };
    mockExtract.mockResolvedValue(addr);

    const mockSearch = vi.fn().mockRejectedValue(new Error('API down'));
    (DomainApiClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      searchResidentialListings: mockSearch,
    }));

    const reaListing = { source: 'rea' as const, address: '42 Smith St' } as any;
    mockSearchRea.mockResolvedValue(reaListing);

    const result = await lookupListingByAddress('42 Smith St Richmond');

    expect(result.status).toBe('found');
    expect(result.source).toBe('rea-scrape');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm -w @ilre/pipeline run test -- --run src/pipeline/extractors/listing-lookup.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement the orchestrator**

Create `listing-lookup.ts`:

```typescript
import type { ListingData, ParsedAddress } from './listing-types';
import { formatAddressForSearch } from './listing-types';
import { extractAddressFromMessage } from './address-extractor';
import { DomainApiClient } from './domain-api';
import type { DomainSearchResult } from './domain-api';
import { mapDomainSearchResultToListing } from './domain-mapper';
import { searchReaByAddress } from './listing-scraper';

export interface LookupResult {
  status: 'found' | 'not-found' | 'no-address';
  listing: ListingData | null;
  source?: 'domain-api' | 'rea-scrape';
  addressSearched?: string;
}

/**
 * Check whether a Domain search result matches the target street address.
 */
function matchesAddress(result: DomainSearchResult, address: ParsedAddress): boolean {
  const prop = result.listing?.propertyDetails;
  if (!prop) return false;

  const resultStreet = (prop.streetNumber || '').toLowerCase();
  const targetStreet = address.streetNumber.toLowerCase();

  if (resultStreet !== targetStreet) return false;

  // Check street name (fuzzy - just first word match)
  const resultName = (prop.street || prop.displayableAddress || '').toLowerCase();
  const targetName = address.streetName.toLowerCase();

  return resultName.includes(targetName);
}

/**
 * Look up a property listing from a user message containing an address.
 *
 * Flow:
 * 1. Extract address from message via LLM
 * 2. Search Domain API for matching listing
 * 3. Fall back to REA scrape if Domain fails
 * 4. Return result with status
 */
export async function lookupListingByAddress(message: string): Promise<LookupResult> {
  // Step 1: Extract address
  const address = await extractAddressFromMessage(message);
  if (!address) {
    return { status: 'no-address', listing: null };
  }

  const addressString = formatAddressForSearch(address);

  // Step 2: Try Domain API
  try {
    const domainClient = new DomainApiClient();
    const results = await domainClient.searchResidentialListings(
      address.suburb,
      address.state || '',
    );

    // Find best match by street address
    const match = results.find(r => matchesAddress(r, address));
    if (match) {
      const listing = mapDomainSearchResultToListing(match);
      return { status: 'found', listing, source: 'domain-api', addressSearched: addressString };
    }
  } catch {
    // Domain API failed - fall through to REA
  }

  // Step 3: Fall back to REA
  try {
    const reaListing = await searchReaByAddress(address);
    if (reaListing) {
      return { status: 'found', listing: reaListing, source: 'rea-scrape', addressSearched: addressString };
    }
  } catch {
    // REA also failed
  }

  // Step 4: Not found anywhere
  return { status: 'not-found', listing: null, addressSearched: addressString };
}
```

**Step 4: Add package export**

Add to `packages/pipeline/package.json` exports:

```json
"./listing-lookup": "./src/pipeline/extractors/listing-lookup.ts"
```

**Step 5: Run tests to verify they pass**

Run: `npm -w @ilre/pipeline run test -- --run src/pipeline/extractors/listing-lookup.test.ts`
Expected: PASS (all tests)

**Step 6: Run full pipeline test suite**

Run: `npm -w @ilre/pipeline run test`
Expected: PASS (all tests including existing ones)

**Step 7: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/listing-lookup.ts packages/pipeline/src/pipeline/extractors/listing-lookup.test.ts packages/pipeline/package.json
git commit -m "feat: add listing lookup orchestrator with Domain API + REA fallback"
```

---

## Task 7: Build the "lookup failed" context block

**Files:**
- Modify: `packages/web/src/lib/deal-analyser-prompt.ts`

**Step 1: Add buildLookupFailedBlock function**

Add after the existing `buildListingDataBlock` function in `deal-analyser-prompt.ts`:

```typescript
/** Build a context block for when address lookup was attempted but no listing found */
export function buildLookupFailedBlock(addressSearched: string): string {
  return `
── PROPERTY LOOKUP RESULT ─────────────────────────────────
Address searched: ${addressSearched}
Status: No active listing found on Domain or REA
Action: Ask the user to provide key property details manually
  (purchase price, weekly rent estimate, beds/baths, land size, property type)
──────────────────────────────────────────────────────────`;
}
```

**Step 2: Run typecheck**

Run: `npm -w @ilre/web run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/web/src/lib/deal-analyser-prompt.ts
git commit -m "feat: add lookup-failed context block for deal analysis prompts"
```

---

## Task 8: Integrate address lookup into chat stream route

**Files:**
- Modify: `packages/web/src/app/api/chat/stream/route.ts`

This is the key integration point. The current deal analysis block (lines 44-75) only handles URL detection. We add address lookup as a second step.

**Step 1: Update the deal analysis block**

Replace the current deal analysis block (the `if (agent === "Deal Analyser Dan" || agent === "FISO Phil")` section) with:

```typescript
    // Deal analysis agents: detect listing URLs or addresses, use custom prompts
    if (agent === "Deal Analyser Dan" || agent === "FISO Phil") {
      const { detectListingUrl } = await import("@ilre/pipeline/listing-types");
      const detected = detectListingUrl(query);

      const isPhil = agent === "FISO Phil";
      const getBasePrompt = async () => {
        if (isPhil) {
          const { FISO_PHIL_SYSTEM_PROMPT } = await import("@/lib/fiso-phil-prompt");
          return FISO_PHIL_SYSTEM_PROMPT;
        }
        const { DEAL_ANALYSER_SYSTEM_PROMPT } = await import("@/lib/deal-analyser-prompt");
        return DEAL_ANALYSER_SYSTEM_PROMPT;
      };

      if (detected) {
        // URL found: scrape directly (existing behavior)
        const basePrompt = await getBasePrompt();
        try {
          const { scrapeListing } = await import("@ilre/pipeline/listing");
          const listing = await scrapeListing(detected.url);
          const { buildListingDataBlock } = await import("@/lib/deal-analyser-prompt");
          systemPromptOverride = basePrompt + "\n\n" + buildListingDataBlock(listing);
        } catch (scrapeError) {
          console.error("Listing scrape failed:", scrapeError);
          systemPromptOverride = basePrompt;
        }
      } else {
        // No URL: try address lookup
        try {
          const { lookupListingByAddress } = await import("@ilre/pipeline/listing-lookup");
          const lookupResult = await lookupListingByAddress(query);

          if (lookupResult.status === 'found' && lookupResult.listing) {
            const basePrompt = await getBasePrompt();
            const { buildListingDataBlock } = await import("@/lib/deal-analyser-prompt");
            systemPromptOverride = basePrompt + "\n\n" + buildListingDataBlock(lookupResult.listing);
          } else if (lookupResult.status === 'not-found') {
            const basePrompt = await getBasePrompt();
            const { buildLookupFailedBlock } = await import("@/lib/deal-analyser-prompt");
            systemPromptOverride = basePrompt + "\n\n" + buildLookupFailedBlock(lookupResult.addressSearched || '');
          } else if (!systemPromptOverride) {
            // No address detected and no Supabase persona
            systemPromptOverride = await getBasePrompt();
          }
        } catch (lookupError) {
          console.error("Address lookup failed:", lookupError);
          if (!systemPromptOverride) {
            systemPromptOverride = await getBasePrompt();
          }
        }
      }
    }
```

**Step 2: Run typecheck**

Run: `npm -w @ilre/web run typecheck`
Expected: PASS

**Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS (all tests across both packages)

**Step 4: Commit**

```bash
git add packages/web/src/app/api/chat/stream/route.ts
git commit -m "feat: integrate address lookup into deal analysis chat stream"
```

---

## Task 9: Add Domain API credentials to environment

**Files:**
- Modify: `.env`

**Step 1: Add placeholder environment variables**

Add to `.env`:

```
# Domain.com.au API (free tier - 500 calls/day)
# Register at https://developer.domain.com.au
DOMAIN_API_CLIENT_ID=
DOMAIN_API_CLIENT_SECRET=
```

**Step 2: Commit**

Do NOT commit the .env file (it likely contains secrets). Just note that the env vars need to be set.

**Step 3: Verify the system gracefully handles missing credentials**

The `DomainApiClient` throws when credentials are missing, but the `lookupListingByAddress` orchestrator catches all errors and falls through to REA. Verify this by checking that the try/catch in the stream route handles this case.

---

## Task 10: Manual Integration Test

**This is a manual verification step - not automated.**

**Step 1: Set Domain API credentials in .env**

Register at https://developer.domain.com.au and get client ID + secret. Add to `.env`.

**Step 2: Start the dev server**

Run: `npm -w @ilre/web run dev`

**Step 3: Test with Dan**

Open the app, switch to Deal Analyser Dan, and send messages like:
- "What do you think of 42 Smith St, Richmond VIC 3121?" (should trigger address lookup)
- "Analyse 15/20 Main Road Heidelberg VIC 3084" (unit address)
- "How do I calculate yield?" (should NOT trigger address lookup)
- Paste a full domain.com.au URL (should still work as before)

**Step 4: Test with Phil**

Switch to FISO Phil and repeat with an address. Verify listing data appears in the analysis.

**Step 5: Test failure scenarios**

- Remove Domain API credentials from .env (should fall back to REA)
- Try an address that doesn't have an active listing (should get manual input prompt)

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | ParsedAddress type + exports | typecheck |
| 2 | LLM address extractor | 5 unit tests |
| 3 | Domain API client | 6 unit tests |
| 4 | Domain-to-ListingData mapper | 6 unit tests |
| 5 | REA search fallback | 3 unit tests |
| 6 | Listing lookup orchestrator | 5 unit tests |
| 7 | Lookup-failed context block | typecheck |
| 8 | Chat stream integration | typecheck + full suite |
| 9 | Environment setup | manual |
| 10 | Manual integration test | manual |

**Total new tests:** ~25 unit tests
**New files:** 6 (3 modules + 3 test files)
**Modified files:** 4 (listing-types, listing-scraper, deal-analyser-prompt, stream route)
