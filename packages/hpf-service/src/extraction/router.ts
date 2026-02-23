import type { BrowserContext, Page } from 'playwright';
import type { BrowserManager } from '../browser/manager';
import { config } from '../config';

// ── HPF API Response Types ─────────────────────────────────────────────────

export interface HpfSearchResult {
  id: string;
  address: string;
}

export interface HpfPropertyDetail {
  id: string;
  rpd: string;
  govId: string;
  locality: string;
  buildingArea: number | null;
  localityPid: string;
  lotCount: number | null;
  images: Array<{ format: string; priority: number; url: string; date: string }>;
  postcode: string;
  state: string;
  address: string;
  addressLine1: string;
  addressLine2: string;
  zone: string[];
  landArea: number | null;
  frontage: number | null;
  lga: string;
  status: string;
  type: string;
  propertyType: string;
  propertyCategory: string;
  yearBuilt: number | null;
  tenure: string | null;
  attributes: {
    bedrooms: number | null;
    bathrooms: number | null;
    parkingSpaces: number | null;
  };
  lastSale: { date: string } | null;
  sales: Array<{
    type: string;
    price: { value: number; unit: string; display: string };
    daysOnTheMarket: number | null;
    attributes: Record<string, unknown>;
    agencies: Array<{ name: string }>;
    id: string;
    date: string;
    firstSeen: { date: string; price: { value: number; unit: string; display: string } } | null;
  }>;
  rentals: Array<{
    type: string;
    price?: { value: number; unit: string; display: string };
    date: string;
  }>;
  valuations: unknown[];
  listings: Array<{
    type: string;
    status: string;
    price: { value: number; unit: string; display: string };
    daysOnTheMarket: number | null;
    attributes: Record<string, unknown>;
    agencies: Array<{ name: string }>;
    id: string;
    date: string;
    firstSeen: { date: string; price: { value: number; unit: string; display: string } } | null;
  }>;
  nearbyDetails: Record<string, {
    value: number;
    unit: string;
    display: string;
    name?: string;
  }>;
  locationInsights: {
    neighbourhoodDemographics: {
      ownedRatio: number;
      rentedRatio: number;
      socialHousingRatio: number;
      seifa: Record<string, unknown>;
    };
    nearestMajorUrban: {
      cbd: { value: number; unit: string; display: string };
    };
    remoteness: string;
  } | null;
  propertyLifeCycle: { stage: string } | null;
  tenancyLifeCycle: { stage: string } | null;
  location?: { type: string; coordinates: [number, number] };
  geom?: unknown;
  [key: string]: unknown;
}

export interface HpfAvmData {
  date: string;
  provider: string;
  value: number;
  range: { lower: number; upper: number };
  confidence: string;
  source: string;
  method: string;
}

export interface HpfNeighbour {
  id: string;
  status: string;
  rpd: string;
  address: {
    streetAddress: string;
    postcode: string;
    locality: string;
    state: string;
  };
  occupancy: string;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  [key: string]: unknown;
}

export interface HpfExternalLink {
  portal: string;
  id?: string;
  profileUrl: string;
}

export interface HpfSuburbProfile {
  suburb: {
    name: string;
    postcode: string;
    state: string;
    pid: string;
    slug: string;
    location: { type: string; coordinates: [number, number] };
    bbox?: unknown;
    boundary?: unknown;
  };
  demographics: {
    population: {
      total: number;
      populationGrowth1Year: number | null;
      populationGrowth3Year: number | null;
      populationGrowth5Year: number | null;
      populationGrowth10Year: number | null;
      medianMortgageRepayMonthly: number | null;
      medianRentWeekly: number | null;
      medianHouseholdIncomeWeekly: number | null;
      [key: string]: unknown; // age breakdowns, occupation, commute, etc.
    };
    housing: {
      totalPrivateDwellings: number | null;
      house: { total: number } | null;
      unit: { total: number } | null;
      ownedRatio: number | null;
      rentedRatio: number | null;
      buildingApprovals: number | null;
      [key: string]: unknown;
    };
    seifa: Record<string, unknown>;
  } | null;
  statistics: {
    house: {
      sold: {
        count: number;
        mean: number | null;
        min: number | null;
        max: number | null;
        median: number | null;
        q1: number | null;
        q3: number | null;
        discountMedian: number | null;
        medianGrowth: number | null;
        domMedian: number | null;
        pageviewsMedian: number | null;
      } | null;
      leased: {
        count: number;
        mean: number | null;
        median: number | null;
        domMedian: number | null;
      } | null;
      forSale: { count: number } | null;
      forRent: { count: number } | null;
      investment: {
        yieldMedian: number | null;
        yieldMean: number | null;
        vacancyRate: number | null;
        marketAbsorptionRate: number | null;
        stockOnMarket: number | null;
        salePriceMedianGrowth1Year: number | null;
        salePriceMedianGrowth3Year: number | null;
        salePriceMedianGrowth5Year: number | null;
        salePriceMedianGrowth10Year: number | null;
        [key: string]: unknown;
      } | null;
    } | null;
    unit?: {
      sold: { count: number; median: number | null; domMedian: number | null } | null;
      leased: { count: number; median: number | null } | null;
      investment: { yieldMedian: number | null; vacancyRate: number | null } | null;
    } | null;
    bedrooms?: Record<string, Record<string, unknown>> | null;
  } | null;
  textSummary: string | null;
  neighbourhood: Record<string, unknown> | null;
  links?: unknown[];
  [key: string]: unknown;
}

export interface HpfPlanningInfo {
  state: string;
  lgaPid: string;
  lga: string;
  zone: string;
  zoneDesc: string;
  heritage: { heritage: string };
  biodiversity: { Biodiversity: string };
  lotSize: { minText: string; avgText: string; minMulti: number };
  [key: string]: unknown;
}

// ── Extraction Result ──────────────────────────────────────────────────────

export interface ExtractionResult {
  property: HpfPropertyDetail;
  avm: HpfAvmData | null;
  neighbours: HpfNeighbour[];
  externalLinks: HpfExternalLink[];
  suburbProfile: HpfSuburbProfile | null;
  planning: HpfPlanningInfo | null;
  method: 'api-replay' | 'api-intercept' | 'dom-scrape';
  fetchedMs: number;
}

// ── Extraction Router ──────────────────────────────────────────────────────

/**
 * Routes extraction requests through available methods in priority order:
 * 1. API replay (direct HTTP calls with auth cookies) -- fastest
 * 2. API intercept (navigate browser + capture JSON responses)
 * 3. DOM scrape (navigate + extract from rendered page) -- slowest
 *
 * HPF's API is cookie-based (httpOnly accessToken + refreshToken).
 * API replay works by extracting cookies from the Playwright context
 * and making direct fetch() calls.
 */
export class ExtractionRouter {
  constructor(private browserManager: BrowserManager) {}

  async lookupProperty(
    address: string,
    suburb?: string,
    state?: string,
    postcode?: string,
  ): Promise<ExtractionResult | null> {
    const start = Date.now();

    // Try API replay first (direct HTTP calls with cookies)
    try {
      const result = await this.apiReplay(address, suburb, state, postcode);
      if (result) {
        return { ...result, method: 'api-replay', fetchedMs: Date.now() - start };
      }
    } catch (err) {
      console.log(`[extraction] API replay failed: ${err instanceof Error ? err.message : err}`);
    }

    // Fallback: API intercept via browser navigation
    try {
      const result = await this.apiIntercept(address, suburb, state, postcode);
      if (result) {
        return { ...result, method: 'api-intercept', fetchedMs: Date.now() - start };
      }
    } catch (err) {
      console.log(`[extraction] API intercept failed: ${err instanceof Error ? err.message : err}`);
    }

    return null;
  }

  // ── API Replay ─────────────────────────────────────────────────────────

  /**
   * Direct HTTP calls to HPF API endpoints using session cookies.
   * This is the fastest extraction method -- no browser navigation needed.
   */
  private async apiReplay(
    address: string,
    suburb?: string,
    state?: string,
    postcode?: string,
  ): Promise<Omit<ExtractionResult, 'method' | 'fetchedMs'> | null> {
    const context = this.browserManager.getContext();
    if (!context) throw new Error('No browser context');

    const cookieHeader = await this.getCookieHeader(context);
    if (!cookieHeader) throw new Error('No auth cookies available');

    // Step 1: Search for the property by address
    // The pipeline sends address as "23 Station St Fairfield VIC 3078" (already includes
    // suburb/state/postcode). Only append extras if they're NOT already in the address.
    const searchQuery = this.buildSearchQuery(address, suburb, state, postcode);
    const searchResults = await this.hpfFetch<HpfSearchResult[]>(
      `/app/api/properties/search?q=${encodeURIComponent(searchQuery)}`,
      cookieHeader,
    );

    if (!searchResults || searchResults.length === 0) {
      console.log(`[extraction] No search results for: ${searchQuery}`);
      return null;
    }

    // Pick best match (first result from HPF's own ranking)
    const propertyId = searchResults[0].id;
    console.log(`[extraction] Found property: ${searchResults[0].address} (${propertyId})`);

    // Step 2: Fetch all property data in parallel
    const [property, avm, neighbours, externalLinks, planning] = await Promise.all([
      this.hpfFetch<HpfPropertyDetail>(`/app/api/properties/${propertyId}`, cookieHeader),
      this.hpfFetch<HpfAvmData>(`/app/api/properties/${propertyId}/avm`, cookieHeader).catch(() => null),
      this.hpfFetch<HpfNeighbour[]>(`/app/api/properties/${propertyId}/neighbours?limit=10`, cookieHeader).catch(() => []),
      this.hpfFetch<HpfExternalLink[]>(`/app/api/externalPortalsLinks/?propertyId=${propertyId}`, cookieHeader).catch(() => []),
      // Planning info needs lat/lon -- we'll get it from the property detail
      null as Promise<HpfPlanningInfo | null> | null,
    ]);

    if (!property) {
      console.log(`[extraction] Failed to fetch property detail for ${propertyId}`);
      return null;
    }

    // Step 3: Fetch planning info using property coordinates
    let planningInfo: HpfPlanningInfo | null = null;
    const coords = property.location?.coordinates;
    if (coords && coords.length === 2) {
      const [lon, lat] = coords;
      try {
        const planningResults = await this.hpfFetch<HpfPlanningInfo[]>(
          `/app/api/planning-info?lat=${lat}&lon=${lon}`,
          cookieHeader,
        );
        planningInfo = planningResults?.[0] || null;
      } catch {}
    }

    // Step 4: Fetch suburb profile if we have a localityPid
    let suburbProfile: HpfSuburbProfile | null = null;
    if (property.localityPid) {
      try {
        suburbProfile = await this.hpfFetch<HpfSuburbProfile>(
          `/app/api/suburb-profile?localityPid=${property.localityPid}`,
          cookieHeader,
        );
      } catch {}
    }

    return {
      property,
      avm: avm || null,
      neighbours: neighbours || [],
      externalLinks: externalLinks || [],
      suburbProfile,
      planning: planningInfo,
    };
  }

  // ── API Intercept ──────────────────────────────────────────────────────

  /**
   * Navigate the browser to HPF's property page and intercept API responses.
   * Slower than replay but works even if direct HTTP calls are blocked.
   */
  private async apiIntercept(
    address: string,
    suburb?: string,
    state?: string,
    postcode?: string,
  ): Promise<Omit<ExtractionResult, 'method' | 'fetchedMs'> | null> {
    const page = await this.browserManager.newPage();
    try {
      return await this.interceptPropertyData(page, address, suburb, state, postcode);
    } finally {
      await page.close();
    }
  }

  private async interceptPropertyData(
    page: Page,
    address: string,
    suburb?: string,
    state?: string,
    postcode?: string,
  ): Promise<Omit<ExtractionResult, 'method' | 'fetchedMs'> | null> {
    let property: HpfPropertyDetail | null = null;
    let avm: HpfAvmData | null = null;
    let neighbours: HpfNeighbour[] = [];
    let externalLinks: HpfExternalLink[] = [];
    let suburbProfile: HpfSuburbProfile | null = null;
    let planning: HpfPlanningInfo | null = null;

    // Intercept JSON API responses during navigation
    page.on('response', async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        if (!contentType.includes('json')) return;

        if (/\/app\/api\/properties\/[^/]+$/.test(url) && !url.includes('/neighbours') && !url.includes('/avm')) {
          property = await response.json().catch(() => null);
        } else if (url.includes('/avm')) {
          avm = await response.json().catch(() => null);
        } else if (url.includes('/neighbours')) {
          neighbours = await response.json().catch(() => []);
        } else if (url.includes('/externalPortalsLinks')) {
          externalLinks = await response.json().catch(() => []);
        } else if (url.includes('/suburb-profile') && !url.includes('/suggest') && !url.includes('/timeseries')) {
          suburbProfile = await response.json().catch(() => null);
        } else if (url.includes('/planning-info')) {
          const planningResults = await response.json().catch(() => []);
          planning = Array.isArray(planningResults) ? planningResults[0] || null : null;
        }
      } catch {}
    });

    // Navigate to HPF and search for the property
    const searchQuery = this.buildSearchQuery(address, suburb, state, postcode);
    await page.goto(`${config.hpf.apiBase}/app/`, {
      waitUntil: 'domcontentloaded',
      timeout: config.browser.requestTimeoutMs,
    });

    // Use the search box to find the property
    // HPF uses an autocomplete search - type the address and select the first result
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill(searchQuery);
    await page.waitForTimeout(1500); // Wait for autocomplete

    // Click first search result
    const firstResult = page.locator('[class*="search-result"], [class*="suggestion"], [role="option"]').first();
    if (await firstResult.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstResult.click();
      // Wait for property page to load
      await page.waitForTimeout(3000);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    }

    if (!property) return null;

    return { property, avm, neighbours, externalLinks, suburbProfile, planning };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Build a clean search query without duplicating suburb/state/postcode.
   * The pipeline often sends address as "23 Station St Fairfield VIC 3078"
   * (already containing suburb/state/postcode), plus separate fields.
   * Naively joining all fields produces "23 Station St Fairfield VIC 3078 Fairfield VIC 3078".
   */
  private buildSearchQuery(
    address: string,
    suburb?: string,
    state?: string,
    postcode?: string,
  ): string {
    // Check if address already contains postcode (strong signal it's a full address)
    if (postcode && address.includes(postcode)) {
      return address;
    }
    // Check if address already contains suburb + state pattern
    if (suburb && state && address.toLowerCase().includes(suburb.toLowerCase()) && address.includes(state)) {
      return address;
    }
    // Otherwise, append missing parts
    return [address, suburb, state, postcode].filter(Boolean).join(' ');
  }

  /**
   * Extract cookie header string from browser context.
   * HPF uses httpOnly cookies (accessToken, refreshToken) for auth.
   */
  private async getCookieHeader(context: BrowserContext): Promise<string | null> {
    const cookies = await context.cookies('https://app.hotpropertyfinder.ai');
    if (cookies.length === 0) return null;

    const authCookies = cookies.filter(c =>
      c.domain.includes('hotpropertyfinder.ai') || c.domain.includes('app.hotpropertyfinder.ai'),
    );

    if (authCookies.length === 0) return null;

    return authCookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Make a direct HTTP call to HPF's API with session cookies.
   */
  private async hpfFetch<T>(path: string, cookieHeader: string): Promise<T | null> {
    const url = `${config.hpf.apiBase}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.browser.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'cookie': cookieHeader,
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
          'referer': `${config.hpf.apiBase}/app/`,
        },
        signal: controller.signal,
      });

      if (response.status === 401) {
        throw new Error('HPF session expired (401)');
      }

      if (!response.ok) {
        console.log(`[extraction] HPF API ${response.status} for ${path}`);
        return null;
      }

      return await response.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
