# Property Intelligence Layer - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add on-demand suburb, zoning, demographic, and sentiment enrichment to property lookups for Deal Analyser Dan and FISO Phil.

**Architecture:** New `intelligence/` module in the pipeline package. Each data source is an independent module that checks a Supabase cache before calling external APIs/Apify. An orchestrator fires all lookups in parallel and returns a `PropertyIntelligence` object. The chat route calls the orchestrator alongside the existing listing lookup and injects the result as a context block.

**Tech Stack:** TypeScript, Apify API (REST), ABS Data API (SDMX REST), Vicmap Planning (Esri REST), Supabase (cache), Vitest (tests)

---

### Task 1: Add new types to listing-types.ts

**Files:**
- Modify: `packages/pipeline/src/pipeline/extractors/listing-types.ts`

**Step 1: Write the new interfaces**

Add after the existing `ParsedAddress` interface and `detectListingUrl` function:

```typescript
/** Property zoning data from state planning APIs */
export interface ZoningData {
  zoneCode: string;
  zoneDescription: string;
  overlays: string[];
  overlayDescriptions: string[];
  maxBuildingHeight: string | null;
  minLotSize: string | null;
  state: string;
  source: string;
  fetchedAt: string;
}

/** School data from myschool.edu.au */
export interface SchoolData {
  name: string;
  type: 'primary' | 'secondary' | 'combined';
  sector: 'government' | 'catholic' | 'independent';
  icsea: number | null;
  enrolments: number | null;
  distanceKm: number | null;
}

/** Neighbourhood sentiment from Homely */
export interface NeighbourhoodSentiment {
  overallRating: number | null;
  reviewCount: number;
  topPositives: string[];
  topNegatives: string[];
  source: 'homely';
}

/** Full enriched property intelligence result */
export interface PropertyIntelligence {
  listing: ListingData | null;
  suburb: SuburbContext;
  zoning: ZoningData | null;
  nearbySchools: SchoolData[];
  sentiment: NeighbourhoodSentiment | null;
  crimeRating: 'low' | 'medium' | 'high' | null;
  fetchedAt: string;
  errors: string[];
}
```

**Step 2: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/listing-types.ts
git commit -m "feat: add PropertyIntelligence, ZoningData, SchoolData, NeighbourhoodSentiment types"
```

---

### Task 2: Intelligence cache layer

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/cache.ts`
- Create: `packages/pipeline/src/pipeline/intelligence/cache.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

import { IntelligenceCache } from './cache';

describe('IntelligenceCache', () => {
  let cache: IntelligenceCache;

  beforeEach(() => {
    mockFrom.mockReset();
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
    cache = new IntelligenceCache();
  });

  it('returns null on cache miss', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          gt: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    });
    const result = await cache.get('suburb-profile', 'richmond', 'vic');
    expect(result).toBeNull();
  });

  it('returns cached data on cache hit', async () => {
    const cached = { medianHousePrice: 1200000 };
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          gt: () => ({
            single: () => Promise.resolve({ data: { data: cached }, error: null }),
          }),
        }),
      }),
    });
    const result = await cache.get('suburb-profile', 'richmond', 'vic');
    expect(result).toEqual(cached);
  });

  it('stores data with correct TTL', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert: upsertMock });

    await cache.set('suburb-profile', 'richmond', 'vic', { test: true });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const call = upsertMock.mock.calls[0][0];
    expect(call.cache_key).toBe('suburb-profile:richmond:vic');
    expect(call.data).toEqual({ test: true });
    // 7 day TTL for suburb-profile
    const expiresAt = new Date(call.expires_at);
    const fetchedAt = new Date(call.fetched_at);
    const diffDays = (expiresAt.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/cache.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const TTL_DAYS: Record<string, number> = {
  'suburb-profile': 7,
  'abs-demographics': 30,
  'zoning': 30,
  'schools': 90,
  'sentiment': 14,
  'vacancy': 7,
  'crime': 90,
};

const TABLE = 'property_intelligence_cache';

export class IntelligenceCache {
  private client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');
    this.client = createClient(url, key);
  }

  async get(source: string, suburb: string, state: string): Promise<unknown | null> {
    const key = `${source}:${suburb.toLowerCase()}:${state.toLowerCase()}`;
    try {
      const { data } = await this.client
        .from(TABLE)
        .select('data')
        .eq('cache_key', key)
        .gt('expires_at', new Date().toISOString())
        .single();
      return data?.data ?? null;
    } catch {
      return null;
    }
  }

  async set(source: string, suburb: string, state: string, value: unknown): Promise<void> {
    const key = `${source}:${suburb.toLowerCase()}:${state.toLowerCase()}`;
    const now = new Date();
    const ttlDays = TTL_DAYS[source] ?? 7;
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    await this.client.from(TABLE).upsert({
      cache_key: key,
      data: value,
      fetched_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/cache.test.ts`
Expected: PASS

**Step 5: Create the Supabase migration**

Run this SQL in Supabase dashboard or via migration:

```sql
CREATE TABLE IF NOT EXISTS property_intelligence_cache (
  cache_key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_intelligence_cache_expires ON property_intelligence_cache (expires_at);
```

**Step 6: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/
git commit -m "feat: add intelligence cache layer with TTL-based Supabase caching"
```

---

### Task 3: Apify client wrapper

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/apify-client.ts`
- Create: `packages/pipeline/src/pipeline/intelligence/apify-client.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { ApifyClient } from './apify-client';

describe('ApifyClient', () => {
  let client: ApifyClient;

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    client = new ApifyClient();
  });

  it('runs an actor and returns dataset items', async () => {
    // Start run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-1' } }),
    });
    // Fetch dataset
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ suburb: 'Richmond', medianPrice: 1200000 }]),
    });

    const result = await client.runActor('test/actor', { suburb: 'Richmond' });
    expect(result).toEqual([{ suburb: 'Richmond', medianPrice: 1200000 }]);
  });

  it('polls when run is not immediately finished', async () => {
    // Start run - RUNNING status
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'run-1', status: 'RUNNING', defaultDatasetId: 'ds-1' } }),
    });
    // Poll - SUCCEEDED
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'run-1', status: 'SUCCEEDED', defaultDatasetId: 'ds-1' } }),
    });
    // Fetch dataset
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ data: 'test' }]),
    });

    const result = await client.runActor('test/actor', {}, { pollIntervalMs: 10 });
    expect(result).toEqual([{ data: 'test' }]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws when APIFY_API_TOKEN is missing', () => {
    vi.stubEnv('APIFY_API_TOKEN', '');
    expect(() => new ApifyClient()).toThrow('APIFY_API_TOKEN');
  });

  it('returns empty array on actor failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: { id: 'run-1', status: 'FAILED', defaultDatasetId: 'ds-1' } }),
    });

    const result = await client.runActor('test/actor', {});
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/apify-client.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
const APIFY_BASE = 'https://api.apify.com/v2';

interface RunOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export class ApifyClient {
  private token: string;

  constructor() {
    this.token = process.env.APIFY_API_TOKEN || '';
    if (!this.token) throw new Error('APIFY_API_TOKEN is required');
  }

  async runActor(actorId: string, input: Record<string, unknown>, opts?: RunOptions): Promise<unknown[]> {
    const pollInterval = opts?.pollIntervalMs ?? 2000;
    const timeout = opts?.timeoutMs ?? 60000;

    // Start the run
    const startRes = await fetch(`${APIFY_BASE}/acts/${actorId}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15000),
    });

    if (!startRes.ok) {
      console.error(`[apify] Failed to start actor ${actorId}: ${startRes.status}`);
      return [];
    }

    let run = (await startRes.json()).data;

    // Poll until finished
    const deadline = Date.now() + timeout;
    while (run.status === 'RUNNING' || run.status === 'READY') {
      if (Date.now() > deadline) {
        console.error(`[apify] Actor ${actorId} timed out`);
        return [];
      }
      await new Promise(r => setTimeout(r, pollInterval));
      const pollRes = await fetch(`${APIFY_BASE}/actor-runs/${run.id}`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!pollRes.ok) return [];
      run = (await pollRes.json()).data;
    }

    if (run.status !== 'SUCCEEDED') {
      console.error(`[apify] Actor ${actorId} finished with status: ${run.status}`);
      return [];
    }

    // Fetch dataset items
    const dsRes = await fetch(`${APIFY_BASE}/datasets/${run.defaultDatasetId}/items`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!dsRes.ok) return [];
    return (await dsRes.json()) as unknown[];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/apify-client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/apify-client.ts packages/pipeline/src/pipeline/intelligence/apify-client.test.ts
git commit -m "feat: add Apify API client wrapper with polling and timeout"
```

---

### Task 4: Domain suburb profile scraper (via Apify)

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/suburb-scraper.ts`
- Create: `packages/pipeline/src/pipeline/intelligence/suburb-scraper.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SuburbContext } from '../extractors/listing-types';

// Mock the Apify client
vi.mock('./apify-client', () => ({
  ApifyClient: vi.fn().mockImplementation(() => ({
    runActor: vi.fn(),
  })),
}));

// Mock cache
vi.mock('./cache', () => ({
  IntelligenceCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { getSuburbProfile } from './suburb-scraper';
import { ApifyClient } from './apify-client';
import { IntelligenceCache } from './cache';

describe('getSuburbProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns suburb context from Apify scrape', async () => {
    const mockData = [{
      medianSoldPrice: 1200000,
      medianUnitPrice: 650000,
      medianRentPrice: 550,
      avgDaysOnMarket: 35,
      auctionClearanceRate: 72,
      demographics: {
        medianAge: 36,
        medianIncome: 85000,
        ownerOccupied: 58,
        familyHouseholds: 52,
        population: 28000,
        populationGrowth: 3.2,
      },
    }];

    (ApifyClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      runActor: vi.fn().mockResolvedValue(mockData),
    }));

    const result = await getSuburbProfile('Richmond', 'VIC', '3121');
    expect(result).not.toBeNull();
    expect(result!.suburb).toBe('Richmond');
    expect(result!.medianHousePrice).toBe(1200000);
    expect(result!.medianWeeklyRent).toBe(550);
    expect(result!.medianAge).toBe(36);
  });

  it('returns cached data when available', async () => {
    const cached: SuburbContext = {
      suburb: 'Richmond',
      state: 'VIC',
      postcode: '3121',
      medianHouseholdIncome: 85000,
      populationGrowth5yr: 3.2,
      ownerOccupierPct: 58,
      medianAge: 36,
      familyHouseholdPct: 52,
      medianHousePrice: 1200000,
      medianUnitPrice: 650000,
      medianWeeklyRent: 550,
      grossRentalYield: null,
      vacancyRate: null,
      averageDaysOnMarket: 35,
      predominantZoning: null,
      dataAsOf: '2026-02-19',
      dataSources: ['domain-suburb-profile'],
    };

    (IntelligenceCache as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      get: vi.fn().mockResolvedValue(cached),
      set: vi.fn(),
    }));

    const result = await getSuburbProfile('Richmond', 'VIC', '3121');
    expect(result).toEqual(cached);
  });

  it('returns null when Apify returns no data', async () => {
    (ApifyClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      runActor: vi.fn().mockResolvedValue([]),
    }));

    const result = await getSuburbProfile('NowhereVille', 'VIC', '9999');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/suburb-scraper.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

Note: The exact Apify actor ID and response shape will need adjustment once we identify/build the right actor. Start with the marketplace `fatihtahta/domain-com-au-scraper` or a custom actor that hits domain.com.au suburb profile pages. The response mapping below is a starting template.

```typescript
import type { SuburbContext } from '../extractors/listing-types';
import { ApifyClient } from './apify-client';
import { IntelligenceCache } from './cache';

// Use an existing Domain.com.au suburb profile scraper actor or build a custom one.
// This actor should accept { url: "https://www.domain.com.au/suburb-profile/richmond-vic-3121" }
// and return the __NEXT_DATA__ suburb profile data.
const SUBURB_PROFILE_ACTOR = process.env.APIFY_SUBURB_ACTOR || 'fatihtahta/domain-com-au-scraper';

export async function getSuburbProfile(
  suburb: string,
  state: string,
  postcode: string,
): Promise<SuburbContext | null> {
  const cache = new IntelligenceCache();

  // Check cache first
  const cached = await cache.get('suburb-profile', suburb, state);
  if (cached) return cached as SuburbContext;

  try {
    const apify = new ApifyClient();
    const slug = `${suburb.toLowerCase().replace(/\s+/g, '-')}-${state.toLowerCase()}-${postcode}`;
    const url = `https://www.domain.com.au/suburb-profile/${slug}`;

    const items = await apify.runActor(SUBURB_PROFILE_ACTOR, {
      startUrls: [{ url }],
      maxItems: 1,
    });

    if (!items.length) return null;

    const raw = items[0] as Record<string, unknown>;
    const demographics = (raw.demographics || {}) as Record<string, number>;

    const result: SuburbContext = {
      suburb,
      state: state.toUpperCase(),
      postcode,
      medianHouseholdIncome: demographics.medianIncome ?? null,
      populationGrowth5yr: demographics.populationGrowth ?? null,
      ownerOccupierPct: demographics.ownerOccupied ?? null,
      medianAge: demographics.medianAge ?? null,
      familyHouseholdPct: demographics.familyHouseholds ?? null,
      medianHousePrice: (raw.medianSoldPrice as number) ?? null,
      medianUnitPrice: (raw.medianUnitPrice as number) ?? null,
      medianWeeklyRent: (raw.medianRentPrice as number) ?? null,
      grossRentalYield: null, // calculated downstream if needed
      vacancyRate: null,      // filled by vacancy-scraper
      averageDaysOnMarket: (raw.avgDaysOnMarket as number) ?? null,
      predominantZoning: null, // filled by zoning-lookup
      dataAsOf: new Date().toISOString().split('T')[0],
      dataSources: ['domain-suburb-profile'],
    };

    await cache.set('suburb-profile', suburb, state, result);
    return result;
  } catch (err) {
    console.error(`[suburb-scraper] Failed for ${suburb} ${state}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/suburb-scraper.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/suburb-scraper.*
git commit -m "feat: add suburb profile scraper via Apify with caching"
```

---

### Task 5: ABS Demographics API client

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/abs-demographics.ts`
- Create: `packages/pipeline/src/pipeline/intelligence/abs-demographics.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('./cache', () => ({
  IntelligenceCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { getAbsDemographics } from './abs-demographics';

describe('getAbsDemographics', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('fetches SEIFA index for a suburb', async () => {
    // Mock the ABS API response (SDMX JSON format)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        dataSets: [{
          observations: {
            '0:0:0': [1078],
          },
        }],
      }),
    });

    const result = await getAbsDemographics('Richmond', 'VIC', '3121');
    expect(result).not.toBeNull();
    expect(result!.seifaAdvantage).toBe(1078);
  });

  it('returns null on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await getAbsDemographics('Nowhere', 'VIC', '9999');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/abs-demographics.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

Note: The ABS Data API uses SA2 region codes, not suburb names. We need a mapping from suburb+state to SA2 code. For now, use the postcode as a proxy (ABS has postcode-level data via Census DataPacks). The exact API query structure may need refinement once we test against the real API.

```typescript
import { IntelligenceCache } from './cache';

const ABS_BASE = 'https://data.api.abs.gov.au/rest/data';

export interface AbsDemographics {
  seifaAdvantage: number | null;
  seifaDisadvantage: number | null;
  medianPersonalIncome: number | null;
  population: number | null;
  medianAge: number | null;
}

export async function getAbsDemographics(
  suburb: string,
  state: string,
  postcode: string,
): Promise<AbsDemographics | null> {
  const cache = new IntelligenceCache();

  const cached = await cache.get('abs-demographics', suburb, state);
  if (cached) return cached as AbsDemographics;

  try {
    // SEIFA by postcode - ABS.Stat SEIFA dataset
    // Format: dataflowId/key?detail=dataonly&format=jsondata
    const seifaUrl = `${ABS_BASE}/ABS,SEIFA_POA,1.0.0/1+2.${postcode}?format=jsondata&detail=dataonly`;

    const res = await fetch(seifaUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`[abs] SEIFA API returned ${res.status} for ${postcode}`);
      return null;
    }

    const data = await res.json();
    const obs = data?.dataSets?.[0]?.observations || {};
    const keys = Object.keys(obs);

    const result: AbsDemographics = {
      seifaAdvantage: keys.length > 0 ? obs[keys[0]]?.[0] ?? null : null,
      seifaDisadvantage: keys.length > 1 ? obs[keys[1]]?.[0] ?? null : null,
      medianPersonalIncome: null, // separate ABS dataset, add later
      population: null,
      medianAge: null,
    };

    await cache.set('abs-demographics', suburb, state, result);
    return result;
  } catch (err) {
    console.error(`[abs] Failed for ${suburb} ${state}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/abs-demographics.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/abs-demographics.*
git commit -m "feat: add ABS Data API client for SEIFA demographics"
```

---

### Task 6: Victorian zoning lookup (Vicmap Planning REST API)

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/zoning-lookup.ts`
- Create: `packages/pipeline/src/pipeline/intelligence/zoning-lookup.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('./cache', () => ({
  IntelligenceCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { getZoningData } from './zoning-lookup';

describe('getZoningData', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns zoning data for a VIC address', async () => {
    // Mock Vicmap geocode
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ location: { x: 145.0, y: -37.8 } }],
      }),
    });
    // Mock Vicmap zone query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        features: [{
          attributes: {
            ZONE_CODE: 'GRZ1',
            ZONE_DESCRIPTION: 'General Residential Zone - Schedule 1',
          },
        }],
      }),
    });
    // Mock overlay query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        features: [{
          attributes: {
            OVERLAY_CODE: 'HO123',
            OVERLAY_DESCRIPTION: 'Heritage Overlay',
          },
        }],
      }),
    });

    const result = await getZoningData('42 Smith St', 'Richmond', 'VIC');
    expect(result).not.toBeNull();
    expect(result!.zoneCode).toBe('GRZ1');
    expect(result!.overlays).toContain('HO123');
  });

  it('returns null for unsupported states', async () => {
    const result = await getZoningData('1 Main St', 'Darwin', 'NT');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/zoning-lookup.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

Start with VIC only. NSW, QLD, SA, WA are stubbed out and return null until implemented.

```typescript
import type { ZoningData } from '../extractors/listing-types';
import { IntelligenceCache } from './cache';

// Vicmap Planning REST API endpoints
const VICMAP_GEOCODE = 'https://services.land.vic.gov.au/SpatialDatamart/rest/addressLookup/findAddress';
const VICMAP_ZONE = 'https://services.land.vic.gov.au/SpatialDatamart/rest/planningScheme/zone/query';
const VICMAP_OVERLAY = 'https://services.land.vic.gov.au/SpatialDatamart/rest/planningScheme/overlay/query';

async function getVicZoning(address: string, suburb: string): Promise<ZoningData | null> {
  try {
    // Step 1: Geocode the address to get coordinates
    const geoUrl = new URL(VICMAP_GEOCODE);
    geoUrl.searchParams.set('address', `${address}, ${suburb}, VIC`);
    geoUrl.searchParams.set('f', 'json');

    const geoRes = await fetch(geoUrl.toString(), { signal: AbortSignal.timeout(10000) });
    if (!geoRes.ok) return null;

    const geoData = await geoRes.json();
    const location = geoData?.candidates?.[0]?.location;
    if (!location) return null;

    const { x: lon, y: lat } = location;

    // Step 2: Query zone at coordinates
    const zoneUrl = new URL(VICMAP_ZONE);
    zoneUrl.searchParams.set('geometry', `${lon},${lat}`);
    zoneUrl.searchParams.set('geometryType', 'esriGeometryPoint');
    zoneUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    zoneUrl.searchParams.set('outFields', 'ZONE_CODE,ZONE_DESCRIPTION');
    zoneUrl.searchParams.set('f', 'json');

    const zoneRes = await fetch(zoneUrl.toString(), { signal: AbortSignal.timeout(10000) });
    if (!zoneRes.ok) return null;

    const zoneData = await zoneRes.json();
    const zone = zoneData?.features?.[0]?.attributes;

    // Step 3: Query overlays at coordinates
    const overlayUrl = new URL(VICMAP_OVERLAY);
    overlayUrl.searchParams.set('geometry', `${lon},${lat}`);
    overlayUrl.searchParams.set('geometryType', 'esriGeometryPoint');
    overlayUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    overlayUrl.searchParams.set('outFields', 'OVERLAY_CODE,OVERLAY_DESCRIPTION');
    overlayUrl.searchParams.set('f', 'json');

    const overlayRes = await fetch(overlayUrl.toString(), { signal: AbortSignal.timeout(10000) });
    const overlayData = overlayRes.ok ? await overlayRes.json() : { features: [] };
    const overlays = (overlayData?.features || []).map(
      (f: { attributes: { OVERLAY_CODE: string; OVERLAY_DESCRIPTION: string } }) => f.attributes
    );

    return {
      zoneCode: zone?.ZONE_CODE || 'Unknown',
      zoneDescription: zone?.ZONE_DESCRIPTION || 'Unknown',
      overlays: overlays.map((o: { OVERLAY_CODE: string }) => o.OVERLAY_CODE),
      overlayDescriptions: overlays.map((o: { OVERLAY_DESCRIPTION: string }) => o.OVERLAY_DESCRIPTION),
      maxBuildingHeight: null, // Not in base zone query, needs schedule lookup
      minLotSize: null,
      state: 'VIC',
      source: 'vicmap-planning',
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[zoning] VIC lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getZoningData(
  address: string,
  suburb: string,
  state: string,
): Promise<ZoningData | null> {
  const cache = new IntelligenceCache();
  const cacheKey = `${address}, ${suburb}`.toLowerCase();
  const cached = await cache.get('zoning', cacheKey, state);
  if (cached) return cached as ZoningData;

  let result: ZoningData | null = null;

  switch (state.toUpperCase()) {
    case 'VIC':
      result = await getVicZoning(address, suburb);
      break;
    case 'NSW':
      // TODO: NSW Planning Portal API
      console.log('[zoning] NSW not yet implemented');
      break;
    case 'QLD':
      // TODO: QLD Globe spatial services
      console.log('[zoning] QLD not yet implemented');
      break;
    case 'SA':
      // TODO: PlanSA
      console.log('[zoning] SA not yet implemented');
      break;
    case 'WA':
      // TODO: Landgate SLIP
      console.log('[zoning] WA not yet implemented');
      break;
    default:
      return null;
  }

  if (result) {
    await cache.set('zoning', cacheKey, state, result);
  }
  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/zoning-lookup.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/zoning-lookup.*
git commit -m "feat: add zoning lookup with VIC Vicmap Planning integration"
```

---

### Task 7: SQM vacancy rate scraper (via Apify)

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/vacancy-scraper.ts`
- Create: `packages/pipeline/src/pipeline/intelligence/vacancy-scraper.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./apify-client', () => ({
  ApifyClient: vi.fn().mockImplementation(() => ({
    runActor: vi.fn(),
  })),
}));

vi.mock('./cache', () => ({
  IntelligenceCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { getVacancyRate } from './vacancy-scraper';
import { ApifyClient } from './apify-client';

describe('getVacancyRate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns vacancy rate from SQM scrape', async () => {
    (ApifyClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      runActor: vi.fn().mockResolvedValue([{ vacancyRate: 1.8 }]),
    }));

    const result = await getVacancyRate('3121');
    expect(result).toBe(1.8);
  });

  it('returns null when no data found', async () => {
    (ApifyClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      runActor: vi.fn().mockResolvedValue([]),
    }));

    const result = await getVacancyRate('9999');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test, verify fails**

**Step 3: Write implementation**

```typescript
import { ApifyClient } from './apify-client';
import { IntelligenceCache } from './cache';

const VACANCY_ACTOR = process.env.APIFY_VACANCY_ACTOR || 'custom/sqm-vacancy-scraper';

export async function getVacancyRate(postcode: string): Promise<number | null> {
  const cache = new IntelligenceCache();
  const cached = await cache.get('vacancy', postcode, 'AU');
  if (cached !== null) return cached as number;

  try {
    const apify = new ApifyClient();
    const items = await apify.runActor(VACANCY_ACTOR, {
      startUrls: [{ url: `https://sqmresearch.com.au/vacancy.php?postcode=${postcode}&t=1` }],
    });

    if (!items.length) return null;

    const raw = items[0] as Record<string, unknown>;
    const rate = typeof raw.vacancyRate === 'number' ? raw.vacancyRate : null;

    if (rate !== null) {
      await cache.set('vacancy', postcode, 'AU', rate);
    }
    return rate;
  } catch (err) {
    console.error(`[vacancy] Failed for ${postcode}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
```

**Step 4: Run test, verify passes**

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/vacancy-scraper.*
git commit -m "feat: add SQM vacancy rate scraper via Apify"
```

---

### Task 8: Homely sentiment scraper (via Apify)

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/sentiment-scraper.ts`
- Create: `packages/pipeline/src/pipeline/intelligence/sentiment-scraper.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NeighbourhoodSentiment } from '../extractors/listing-types';

vi.mock('./apify-client', () => ({
  ApifyClient: vi.fn().mockImplementation(() => ({
    runActor: vi.fn(),
  })),
}));

vi.mock('./cache', () => ({
  IntelligenceCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { getNeighbourhoodSentiment } from './sentiment-scraper';
import { ApifyClient } from './apify-client';

describe('getNeighbourhoodSentiment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APIFY_API_TOKEN', 'test-token');
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key');
  });

  it('returns sentiment data from Homely scrape', async () => {
    (ApifyClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      runActor: vi.fn().mockResolvedValue([{
        overallRating: 4.2,
        reviewCount: 128,
        positives: ['Family friendly', 'Great cafes', 'Leafy streets'],
        negatives: ['Traffic', 'Parking'],
      }]),
    }));

    const result = await getNeighbourhoodSentiment('Richmond', 'VIC');
    expect(result).not.toBeNull();
    expect(result!.overallRating).toBe(4.2);
    expect(result!.reviewCount).toBe(128);
    expect(result!.topPositives).toContain('Family friendly');
    expect(result!.source).toBe('homely');
  });

  it('returns null when no data found', async () => {
    (ApifyClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      runActor: vi.fn().mockResolvedValue([]),
    }));

    const result = await getNeighbourhoodSentiment('Nowhere', 'VIC');
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test, verify fails**

**Step 3: Write implementation**

```typescript
import type { NeighbourhoodSentiment } from '../extractors/listing-types';
import { ApifyClient } from './apify-client';
import { IntelligenceCache } from './cache';

const SENTIMENT_ACTOR = process.env.APIFY_SENTIMENT_ACTOR || 'custom/homely-suburb-scraper';

export async function getNeighbourhoodSentiment(
  suburb: string,
  state: string,
): Promise<NeighbourhoodSentiment | null> {
  const cache = new IntelligenceCache();
  const cached = await cache.get('sentiment', suburb, state);
  if (cached) return cached as NeighbourhoodSentiment;

  try {
    const apify = new ApifyClient();
    const slug = `${state.toLowerCase()}/${suburb.toLowerCase().replace(/\s+/g, '-')}`;
    const items = await apify.runActor(SENTIMENT_ACTOR, {
      startUrls: [{ url: `https://www.homely.com.au/${slug}` }],
    });

    if (!items.length) return null;

    const raw = items[0] as Record<string, unknown>;

    const result: NeighbourhoodSentiment = {
      overallRating: typeof raw.overallRating === 'number' ? raw.overallRating : null,
      reviewCount: typeof raw.reviewCount === 'number' ? raw.reviewCount : 0,
      topPositives: Array.isArray(raw.positives) ? raw.positives.slice(0, 5) : [],
      topNegatives: Array.isArray(raw.negatives) ? raw.negatives.slice(0, 5) : [],
      source: 'homely',
    };

    await cache.set('sentiment', suburb, state, result);
    return result;
  } catch (err) {
    console.error(`[sentiment] Failed for ${suburb} ${state}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
```

**Step 4: Run test, verify passes**

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/sentiment-scraper.*
git commit -m "feat: add Homely neighbourhood sentiment scraper via Apify"
```

---

### Task 9: Intelligence orchestrator

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/orchestrator.ts`
- Create: `packages/pipeline/src/pipeline/intelligence/orchestrator.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./suburb-scraper', () => ({
  getSuburbProfile: vi.fn(),
}));
vi.mock('./abs-demographics', () => ({
  getAbsDemographics: vi.fn(),
}));
vi.mock('./zoning-lookup', () => ({
  getZoningData: vi.fn(),
}));
vi.mock('./vacancy-scraper', () => ({
  getVacancyRate: vi.fn(),
}));
vi.mock('./sentiment-scraper', () => ({
  getNeighbourhoodSentiment: vi.fn(),
}));

import { enrichPropertyIntelligence } from './orchestrator';
import { getSuburbProfile } from './suburb-scraper';
import { getAbsDemographics } from './abs-demographics';
import { getZoningData } from './zoning-lookup';
import { getVacancyRate } from './vacancy-scraper';
import { getNeighbourhoodSentiment } from './sentiment-scraper';

describe('enrichPropertyIntelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combines all data sources in parallel', async () => {
    (getSuburbProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      suburb: 'Richmond', state: 'VIC', postcode: '3121',
      medianHousePrice: 1200000, medianWeeklyRent: 550,
      medianHouseholdIncome: null, populationGrowth5yr: null,
      ownerOccupierPct: null, medianAge: null, familyHouseholdPct: null,
      medianUnitPrice: null, grossRentalYield: null, vacancyRate: null,
      averageDaysOnMarket: 35, predominantZoning: null,
      dataAsOf: '2026-02-19', dataSources: ['domain'],
    });
    (getAbsDemographics as ReturnType<typeof vi.fn>).mockResolvedValue({
      seifaAdvantage: 1078, seifaDisadvantage: null,
      medianPersonalIncome: 52000, population: 28000, medianAge: 36,
    });
    (getZoningData as ReturnType<typeof vi.fn>).mockResolvedValue({
      zoneCode: 'GRZ1', zoneDescription: 'General Residential',
      overlays: ['HO123'], overlayDescriptions: ['Heritage'],
      maxBuildingHeight: null, minLotSize: null,
      state: 'VIC', source: 'vicmap', fetchedAt: '2026-02-19',
    });
    (getVacancyRate as ReturnType<typeof vi.fn>).mockResolvedValue(1.8);
    (getNeighbourhoodSentiment as ReturnType<typeof vi.fn>).mockResolvedValue({
      overallRating: 4.2, reviewCount: 128,
      topPositives: ['Great cafes'], topNegatives: ['Traffic'],
      source: 'homely',
    });

    const result = await enrichPropertyIntelligence({
      address: '42 Smith St',
      suburb: 'Richmond',
      state: 'VIC',
      postcode: '3121',
    });

    expect(result.suburb.medianHousePrice).toBe(1200000);
    expect(result.suburb.vacancyRate).toBe(1.8);
    expect(result.zoning?.zoneCode).toBe('GRZ1');
    expect(result.sentiment?.overallRating).toBe(4.2);
    expect(result.errors).toEqual([]);
  });

  it('handles partial failures gracefully', async () => {
    (getSuburbProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      suburb: 'Richmond', state: 'VIC', postcode: '3121',
      medianHousePrice: 1200000, medianWeeklyRent: 550,
      medianHouseholdIncome: null, populationGrowth5yr: null,
      ownerOccupierPct: null, medianAge: null, familyHouseholdPct: null,
      medianUnitPrice: null, grossRentalYield: null, vacancyRate: null,
      averageDaysOnMarket: null, predominantZoning: null,
      dataAsOf: '2026-02-19', dataSources: ['domain'],
    });
    (getAbsDemographics as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API down'));
    (getZoningData as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getVacancyRate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getNeighbourhoodSentiment as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await enrichPropertyIntelligence({
      address: '42 Smith St',
      suburb: 'Richmond',
      state: 'VIC',
      postcode: '3121',
    });

    // Still returns suburb data even though other sources failed
    expect(result.suburb.medianHousePrice).toBe(1200000);
    expect(result.zoning).toBeNull();
    expect(result.sentiment).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns empty suburb context when all sources fail', async () => {
    (getSuburbProfile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getAbsDemographics as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getZoningData as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getVacancyRate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getNeighbourhoodSentiment as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await enrichPropertyIntelligence({
      suburb: 'Nowhere',
      state: 'VIC',
      postcode: '9999',
    });

    expect(result.suburb.suburb).toBe('Nowhere');
    expect(result.zoning).toBeNull();
  });
});
```

**Step 2: Run test, verify fails**

**Step 3: Write implementation**

```typescript
import type { SuburbContext, ZoningData, NeighbourhoodSentiment, PropertyIntelligence } from '../extractors/listing-types';
import { getSuburbProfile } from './suburb-scraper';
import { getAbsDemographics } from './abs-demographics';
import { getZoningData } from './zoning-lookup';
import { getVacancyRate } from './vacancy-scraper';
import { getNeighbourhoodSentiment } from './sentiment-scraper';

interface EnrichmentInput {
  address?: string;
  suburb: string;
  state: string;
  postcode: string;
}

function emptySuburbContext(suburb: string, state: string, postcode: string): SuburbContext {
  return {
    suburb, state, postcode,
    medianHouseholdIncome: null,
    populationGrowth5yr: null,
    ownerOccupierPct: null,
    medianAge: null,
    familyHouseholdPct: null,
    medianHousePrice: null,
    medianUnitPrice: null,
    medianWeeklyRent: null,
    grossRentalYield: null,
    vacancyRate: null,
    averageDaysOnMarket: null,
    predominantZoning: null,
    dataAsOf: new Date().toISOString().split('T')[0],
    dataSources: [],
  };
}

export async function enrichPropertyIntelligence(input: EnrichmentInput): Promise<PropertyIntelligence> {
  const { address, suburb, state, postcode } = input;
  const errors: string[] = [];

  // Fire all lookups in parallel
  const [suburbResult, absResult, zoningResult, vacancyResult, sentimentResult] = await Promise.allSettled([
    getSuburbProfile(suburb, state, postcode),
    getAbsDemographics(suburb, state, postcode),
    address ? getZoningData(address, suburb, state) : Promise.resolve(null),
    getVacancyRate(postcode),
    getNeighbourhoodSentiment(suburb, state),
  ]);

  // Build suburb context from profile (or empty)
  let suburbContext: SuburbContext;
  if (suburbResult.status === 'fulfilled' && suburbResult.value) {
    suburbContext = suburbResult.value;
  } else {
    suburbContext = emptySuburbContext(suburb, state, postcode);
    if (suburbResult.status === 'rejected') {
      errors.push(`Suburb profile: ${suburbResult.reason}`);
    }
  }

  // Merge ABS demographics into suburb context
  if (absResult.status === 'fulfilled' && absResult.value) {
    const abs = absResult.value;
    if (abs.medianAge && !suburbContext.medianAge) suburbContext.medianAge = abs.medianAge;
    if (abs.population) suburbContext.dataSources.push('abs-census');
  } else if (absResult.status === 'rejected') {
    errors.push(`ABS demographics: ${absResult.reason}`);
  }

  // Zoning
  let zoning: ZoningData | null = null;
  if (zoningResult.status === 'fulfilled') {
    zoning = zoningResult.value;
    if (zoning) suburbContext.predominantZoning = zoning.zoneCode;
  } else {
    errors.push(`Zoning: ${zoningResult.reason}`);
  }

  // Vacancy rate - merge into suburb context
  if (vacancyResult.status === 'fulfilled' && vacancyResult.value !== null) {
    suburbContext.vacancyRate = vacancyResult.value;
    suburbContext.dataSources.push('sqm-research');
  } else if (vacancyResult.status === 'rejected') {
    errors.push(`Vacancy: ${vacancyResult.reason}`);
  }

  // Sentiment
  let sentiment: NeighbourhoodSentiment | null = null;
  if (sentimentResult.status === 'fulfilled') {
    sentiment = sentimentResult.value;
  } else {
    errors.push(`Sentiment: ${sentimentResult.reason}`);
  }

  return {
    listing: null, // Listing is attached by the caller (chat route)
    suburb: suburbContext,
    zoning,
    nearbySchools: [], // Phase 2
    sentiment,
    crimeRating: null, // Phase 2
    fetchedAt: new Date().toISOString(),
    errors,
  };
}
```

**Step 4: Run test, verify passes**

Run: `cd packages/pipeline && npx vitest run src/pipeline/intelligence/orchestrator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/orchestrator.*
git commit -m "feat: add intelligence orchestrator combining all data sources in parallel"
```

---

### Task 10: Barrel export and package.json exports

**Files:**
- Create: `packages/pipeline/src/pipeline/intelligence/index.ts`
- Modify: `packages/pipeline/package.json`

**Step 1: Create barrel export**

```typescript
export { enrichPropertyIntelligence } from './orchestrator';
export { IntelligenceCache } from './cache';
export { ApifyClient } from './apify-client';
export { getSuburbProfile } from './suburb-scraper';
export { getAbsDemographics } from './abs-demographics';
export type { AbsDemographics } from './abs-demographics';
export { getZoningData } from './zoning-lookup';
export { getVacancyRate } from './vacancy-scraper';
export { getNeighbourhoodSentiment } from './sentiment-scraper';
```

**Step 2: Add export to package.json**

Add to the `exports` field in `packages/pipeline/package.json`:

```json
"./intelligence": "./src/pipeline/intelligence/index.ts"
```

**Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline/intelligence/index.ts packages/pipeline/package.json
git commit -m "feat: add intelligence barrel export and package.json entry"
```

---

### Task 11: Prompt injection - buildPropertyIntelligenceBlock

**Files:**
- Modify: `packages/web/src/lib/deal-analyser-prompt.ts`

**Step 1: Write the function**

Add to `deal-analyser-prompt.ts`:

```typescript
import type { PropertyIntelligence } from '@ilre/pipeline/listing-types';

export function buildPropertyIntelligenceBlock(intel: PropertyIntelligence): string {
  const s = intel.suburb;
  const z = intel.zoning;
  const sent = intel.sentiment;
  const lines: string[] = [];

  lines.push(`\n── SUBURB INTELLIGENCE: ${s.suburb.toUpperCase()}, ${s.state} ${s.postcode} ──`);

  // Market data
  const marketParts: string[] = [];
  if (s.medianHousePrice) marketParts.push(`Median house: $${(s.medianHousePrice / 1000).toFixed(0)}K`);
  if (s.medianUnitPrice) marketParts.push(`Units: $${(s.medianUnitPrice / 1000).toFixed(0)}K`);
  if (s.medianWeeklyRent) marketParts.push(`Weekly rent: $${s.medianWeeklyRent}`);
  if (marketParts.length) lines.push(marketParts.join(' | '));

  const yieldParts: string[] = [];
  if (s.grossRentalYield) yieldParts.push(`Gross yield: ${s.grossRentalYield}%`);
  if (s.vacancyRate !== null) yieldParts.push(`Vacancy: ${s.vacancyRate}%`);
  if (s.averageDaysOnMarket) yieldParts.push(`Avg days on market: ${s.averageDaysOnMarket}`);
  if (s.suburbAuctionClearance) yieldParts.push(`Auction clearance: ${s.suburbAuctionClearance}%`);
  if (yieldParts.length) lines.push(yieldParts.join(' | '));

  // Demographics
  const demoParts: string[] = [];
  if (s.medianAge) demoParts.push(`Median age: ${s.medianAge}`);
  if (s.medianHouseholdIncome) demoParts.push(`Median income: $${(s.medianHouseholdIncome / 1000).toFixed(0)}K`);
  if (s.ownerOccupierPct) demoParts.push(`Owner-occupier: ${s.ownerOccupierPct}%`);
  if (s.familyHouseholdPct) demoParts.push(`Family households: ${s.familyHouseholdPct}%`);
  if (s.populationGrowth5yr) demoParts.push(`5yr pop growth: ${s.populationGrowth5yr}%`);
  if (demoParts.length) lines.push(demoParts.join(' | '));

  // Zoning
  if (z) {
    lines.push(`\nZoning: ${z.zoneCode} (${z.zoneDescription})`);
    if (z.overlays.length) {
      lines.push(`Overlays: ${z.overlays.join(', ')}`);
    }
    if (z.maxBuildingHeight) lines.push(`Max height: ${z.maxBuildingHeight}`);
    if (z.minLotSize) lines.push(`Min lot size: ${z.minLotSize}`);
  }

  // Sentiment
  if (sent && sent.overallRating) {
    const posStr = sent.topPositives.length ? sent.topPositives.join(', ') : 'N/A';
    const negStr = sent.topNegatives.length ? sent.topNegatives.join(', ') : 'N/A';
    lines.push(`\nNeighbourhood: ${sent.overallRating}/5 (${sent.reviewCount} reviews)`);
    lines.push(`Positives: ${posStr}`);
    lines.push(`Negatives: ${negStr}`);
  }

  // Sources
  const sources = [...s.dataSources];
  if (z) sources.push(z.source);
  if (sent) sources.push('homely');
  lines.push(`\nSources: ${sources.join(', ')}`);
  lines.push('──────────────────────────────────────────');

  return lines.join('\n');
}
```

**Step 2: Commit**

```bash
git add packages/web/src/lib/deal-analyser-prompt.ts
git commit -m "feat: add buildPropertyIntelligenceBlock for agent prompt injection"
```

---

### Task 12: Integrate into chat route

**Files:**
- Modify: `packages/web/src/app/api/chat/stream/route.ts`

**Step 1: Add intelligence enrichment call alongside listing lookup**

In the deal analysis agent section of `route.ts`, after the listing lookup succeeds or fails, add a parallel call to the intelligence orchestrator. The intelligence block is appended to the system prompt alongside the listing data block.

Key changes to `route.ts`:
1. Import `enrichPropertyIntelligence` from `@ilre/pipeline/intelligence`
2. Import `buildPropertyIntelligenceBlock` from `@/lib/deal-analyser-prompt`
3. After detecting a URL or address, fire `enrichPropertyIntelligence()` in parallel with the listing lookup
4. Append the intelligence block to the system prompt

```typescript
// In the else block (no URL, try address lookup), after lookupListingByAddress:

// Fire intelligence enrichment in parallel
const intelligencePromise = (async () => {
  try {
    const { enrichPropertyIntelligence } = await import("@ilre/pipeline/intelligence");
    const { buildPropertyIntelligenceBlock } = await import("@/lib/deal-analyser-prompt");

    // Extract suburb/state/postcode from listing or address
    const suburb = lookupResult.listing?.suburb || address?.suburb || '';
    const state = lookupResult.listing?.state || address?.state || '';
    const postcode = lookupResult.listing?.postcode || address?.postcode || '';
    const addr = lookupResult.listing?.address || (address ? formatAddressForSearch(address) : '');

    if (!suburb) return '';

    const intel = await enrichPropertyIntelligence({ address: addr, suburb, state, postcode });
    return buildPropertyIntelligenceBlock(intel);
  } catch (err) {
    console.error("Intelligence enrichment failed:", err);
    return '';
  }
})();

// Wait for intelligence result
const intelligenceBlock = await intelligencePromise;

// Append to system prompt (after listing data block)
if (intelligenceBlock) {
  systemPromptOverride += "\n\n" + intelligenceBlock;
}
```

For the URL scrape path, do the same - extract suburb/state/postcode from the scraped listing and fire enrichment.

**Step 2: Run the dev server and test manually**

Run: `cd packages/web && npm run dev`
Test by chatting with Deal Analyser Dan about a property address.

**Step 3: Commit**

```bash
git add packages/web/src/app/api/chat/stream/route.ts
git commit -m "feat: integrate property intelligence enrichment into deal analysis chat route"
```

---

### Task 13: Add APIFY_API_TOKEN to .env and .env.example

**Files:**
- Modify: `.env`
- Modify: `.env.example` (if exists)

**Step 1: Add the env var**

```
# Apify (property intelligence scraping)
APIFY_API_TOKEN=<your-apify-api-token>

# Optional: override default Apify actor IDs
# APIFY_SUBURB_ACTOR=fatihtahta/domain-com-au-scraper
# APIFY_VACANCY_ACTOR=custom/sqm-vacancy-scraper
# APIFY_SENTIMENT_ACTOR=custom/homely-suburb-scraper
```

**Step 2: Commit .env.example only (never commit .env)**

```bash
git add .env.example
git commit -m "docs: add APIFY_API_TOKEN to .env.example"
```

---

### Task 14: Run all tests

**Step 1: Run the full test suite**

Run: `cd packages/pipeline && npx vitest run`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `cd packages/pipeline && npx tsc --noEmit`
Expected: No errors

---

## Phase 2 (follow-up, not in this plan)

- School lookup (myschool.edu.au)
- Crime data caching (BOCSAR/VIC CSA)
- NSW zoning (Planning Portal API)
- QLD/SA/WA zoning
- ABS additional datasets (income, population, dwelling counts)
- Gross rental yield calculation from median price + rent
