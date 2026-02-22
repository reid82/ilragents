# Deal Analysis Agents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two new agents to the ILR Agents platform - Deal Analyser Dan (conversational deal assessment) and FISO Phil (structured calculator with report card) - sharing a common listing scraper and suburb enrichment layer.

**Architecture:** New agents integrate into the existing chat pipeline. A listing scraper (Cheerio-based, matching existing patterns) extracts structured data from domain.com.au and realestate.com.au. The chat stream route detects URLs in messages and injects scraped data as context. FISO Phil adds hard-coded TypeScript calculation modules for FISO, cashflow, sensitivity, and capacity analysis.

**Tech Stack:** TypeScript, Next.js 16, Cheerio, Vitest, existing RAG pipeline via `@ilre/pipeline`

---

### Task 1: Listing Types

**Files:**
- Create: `packages/pipeline/src/pipeline/extractors/listing-types.ts`

**Step 1: Create the shared types file**

```typescript
// packages/pipeline/src/pipeline/extractors/listing-types.ts

export interface ListingData {
  source: 'domain' | 'rea';
  url: string;
  // Property
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  landSize: number | null;
  buildingSize: number | null;
  // Listing
  price: string | null;
  priceGuide: number | null;
  listingType: 'sale' | 'auction' | 'eoi' | 'unknown';
  auctionDate: string | null;
  daysOnMarket: number | null;
  // Content
  description: string;
  features: string[];
  images: string[];
  // Agent
  agentName: string | null;
  agencyName: string | null;
  // Embedded suburb data (domain provides some of this)
  suburbMedianPrice: number | null;
  suburbMedianRent: number | null;
  suburbDaysOnMarket: number | null;
  suburbAuctionClearance: number | null;
  // Raw
  rawData: Record<string, unknown>;
}

export interface SuburbContext {
  suburb: string;
  state: string;
  postcode: string;
  medianHouseholdIncome: number | null;
  populationGrowth5yr: number | null;
  ownerOccupierPct: number | null;
  medianAge: number | null;
  familyHouseholdPct: number | null;
  medianHousePrice: number | null;
  medianUnitPrice: number | null;
  medianWeeklyRent: number | null;
  grossRentalYield: number | null;
  vacancyRate: number | null;
  averageDaysOnMarket: number | null;
  predominantZoning: string | null;
  dataAsOf: string;
  dataSources: string[];
}

export interface ScrapeResult {
  listing: ListingData;
  suburb: SuburbContext | null;
  scrapedAt: string;
  errors: string[];
}

/** Detect whether a string is a supported listing URL */
export function detectListingUrl(text: string): { url: string; source: 'domain' | 'rea' } | null {
  const domainMatch = text.match(/(https?:\/\/(?:www\.)?domain\.com\.au\/[^\s]+)/i);
  if (domainMatch) return { url: domainMatch[1], source: 'domain' };

  const reaMatch = text.match(/(https?:\/\/(?:www\.)?realestate\.com\.au\/[^\s]+)/i);
  if (reaMatch) return { url: reaMatch[1], source: 'rea' };

  return null;
}
```

**Step 2: Run typecheck**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline tsc --noEmit`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/listing-types.ts
git commit -m "feat: add shared listing and suburb types for deal analysis"
```

---

### Task 2: Listing Scraper - Domain.com.au

**Files:**
- Create: `packages/pipeline/src/pipeline/extractors/listing-scraper.ts`
- Create: `packages/pipeline/src/pipeline/extractors/listing-scraper.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/pipeline/src/pipeline/extractors/listing-scraper.test.ts
import { describe, it, expect } from 'vitest';
import { parseDomainListing, parseReaListing, detectListingUrl } from './listing-scraper';

describe('detectListingUrl', () => {
  it('detects domain.com.au URL', () => {
    const result = detectListingUrl('Check this out https://www.domain.com.au/123-fake-street-suburb-vic-3000-abc123');
    expect(result).toEqual({
      url: 'https://www.domain.com.au/123-fake-street-suburb-vic-3000-abc123',
      source: 'domain',
    });
  });

  it('detects realestate.com.au URL', () => {
    const result = detectListingUrl('Look at https://www.realestate.com.au/property-house-vic-suburb-456');
    expect(result).toEqual({
      url: 'https://www.realestate.com.au/property-house-vic-suburb-456',
      source: 'rea',
    });
  });

  it('returns null for non-listing text', () => {
    expect(detectListingUrl('123 Main St, Suburbia')).toBeNull();
  });
});

describe('parseDomainListing', () => {
  it('extracts listing data from __NEXT_DATA__ JSON', () => {
    const html = `<html><head></head><body>
      <script id="__NEXT_DATA__" type="application/json">
      ${JSON.stringify({
        props: {
          pageProps: {
            listingDetails: {
              id: 12345,
              listingType: 'sale',
              headline: '3 Bed Family Home',
              priceDetails: { displayPrice: '$750,000' },
              addressParts: {
                displayAddress: '123 Fake St, Richmond',
                suburb: 'Richmond',
                state: 'VIC',
                postcode: '3121',
              },
              features: {
                bedrooms: 3,
                bathrooms: 2,
                parkingSpaces: 1,
              },
              landArea: 450,
              buildingArea: 180,
              propertyTypes: ['house'],
              description: 'A lovely 3 bed home.',
              media: [{ url: 'https://img.domain.com.au/photo.jpg' }],
              agents: [{ name: 'Jane Agent', agency: { name: 'Top Agency' } }],
            },
          },
        },
      })}
      </script></body></html>`;

    const result = parseDomainListing(html, 'https://domain.com.au/test');
    expect(result.source).toBe('domain');
    expect(result.suburb).toBe('Richmond');
    expect(result.state).toBe('VIC');
    expect(result.postcode).toBe('3121');
    expect(result.bedrooms).toBe(3);
    expect(result.bathrooms).toBe(2);
    expect(result.parking).toBe(1);
    expect(result.landSize).toBe(450);
    expect(result.propertyType).toBe('house');
    expect(result.price).toBe('$750,000');
    expect(result.description).toContain('lovely');
    expect(result.agentName).toBe('Jane Agent');
    expect(result.agencyName).toBe('Top Agency');
  });

  it('handles missing optional fields gracefully', () => {
    const html = `<html><body>
      <script id="__NEXT_DATA__" type="application/json">
      ${JSON.stringify({
        props: { pageProps: { listingDetails: {
          id: 99,
          addressParts: { displayAddress: '1 Elm St', suburb: 'Test', state: 'NSW', postcode: '2000' },
          features: {},
          propertyTypes: [],
          description: '',
          media: [],
          agents: [],
        }}}
      })}
      </script></body></html>`;

    const result = parseDomainListing(html, 'https://domain.com.au/test2');
    expect(result.bedrooms).toBeNull();
    expect(result.price).toBeNull();
    expect(result.agentName).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/extractors/listing-scraper.test.ts`
Expected: FAIL - module not found

**Step 3: Write the listing scraper implementation**

```typescript
// packages/pipeline/src/pipeline/extractors/listing-scraper.ts
import * as cheerio from 'cheerio';
import type { ListingData } from './listing-types';
export { detectListingUrl } from './listing-types';

/**
 * Fetch HTML from a URL with browser-like headers
 */
async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-AU,en;q=0.9',
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
  }
  return response.text();
}

/**
 * Parse a numeric price from display text like "$750,000", "$650,000 - $700,000", "Contact Agent"
 */
function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  // Match first dollar amount
  const match = text.match(/\$[\d,]+/);
  if (!match) return null;
  return parseInt(match[0].replace(/[$,]/g, ''), 10) || null;
}

/**
 * Parse domain.com.au listing from HTML containing __NEXT_DATA__
 */
export function parseDomainListing(html: string, url: string): ListingData {
  const $ = cheerio.load(html);
  const scriptContent = $('#__NEXT_DATA__').html();

  if (!scriptContent) {
    throw new Error('Could not find __NEXT_DATA__ on domain.com.au page');
  }

  const nextData = JSON.parse(scriptContent);
  const listing = nextData?.props?.pageProps?.listingDetails;

  if (!listing) {
    throw new Error('Could not find listingDetails in domain.com.au page data');
  }

  const addr = listing.addressParts || {};
  const features = listing.features || {};
  const priceText = listing.priceDetails?.displayPrice || listing.price || null;
  const agents = listing.agents || [];
  const firstAgent = agents[0];

  return {
    source: 'domain',
    url,
    address: addr.displayAddress || '',
    suburb: addr.suburb || '',
    state: addr.state || '',
    postcode: addr.postcode || '',
    propertyType: (listing.propertyTypes || [])[0] || 'unknown',
    bedrooms: features.bedrooms ?? null,
    bathrooms: features.bathrooms ?? null,
    parking: features.parkingSpaces ?? null,
    landSize: listing.landArea ?? null,
    buildingSize: listing.buildingArea ?? null,
    price: priceText,
    priceGuide: parsePrice(priceText),
    listingType: listing.listingType === 'sale' ? 'sale'
      : listing.listingType === 'auction' ? 'auction'
      : listing.listingType === 'expressionOfInterest' ? 'eoi'
      : 'unknown',
    auctionDate: listing.auctionSchedule?.auctionDate || null,
    daysOnMarket: listing.daysOnMarket ?? null,
    description: listing.description || '',
    features: (listing.propertyFeatures || []).map((f: { displayLabel?: string }) => f.displayLabel).filter(Boolean),
    images: (listing.media || []).map((m: { url?: string }) => m.url).filter(Boolean),
    agentName: firstAgent?.name || null,
    agencyName: firstAgent?.agency?.name || null,
    suburbMedianPrice: listing.suburbInsights?.medianSoldPrice ?? null,
    suburbMedianRent: listing.suburbInsights?.medianRentPrice ?? null,
    suburbDaysOnMarket: listing.suburbInsights?.avgDaysOnMarket ?? null,
    suburbAuctionClearance: listing.suburbInsights?.auctionClearanceRate ?? null,
    rawData: listing,
  };
}

/**
 * Parse realestate.com.au listing from HTML containing ArgonautExchange
 */
export function parseReaListing(html: string, url: string): ListingData {
  const $ = cheerio.load(html);

  // REA stores data in a script tag as window.ArgonautExchange
  let argonautData: Record<string, unknown> | null = null;
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    if (text.includes('ArgonautExchange')) {
      const match = text.match(/window\.ArgonautExchange\s*=\s*(\{[\s\S]*?\});/);
      if (match) {
        try {
          argonautData = JSON.parse(match[1]);
        } catch {
          // Try double-parsing (sometimes it's stringified)
          try {
            argonautData = JSON.parse(JSON.parse(match[1]));
          } catch { /* skip */ }
        }
      }
    }
  });

  if (!argonautData) {
    throw new Error('Could not find ArgonautExchange on realestate.com.au page');
  }

  // REA structure varies - extract what we can
  const details = (argonautData as Record<string, unknown>).details as Record<string, unknown> || argonautData;
  const address = (details.address || {}) as Record<string, string>;
  const features = (details.features || {}) as Record<string, number>;
  const priceText = (details.price as Record<string, string>)?.display || null;

  return {
    source: 'rea',
    url,
    address: address.display || '',
    suburb: address.suburb || '',
    state: address.state || '',
    postcode: address.postcode || '',
    propertyType: (details.propertyType as string) || 'unknown',
    bedrooms: features.bedrooms ?? null,
    bathrooms: features.bathrooms ?? null,
    parking: features.parking ?? null,
    landSize: (details.landSize as number) ?? null,
    buildingSize: (details.buildingSize as number) ?? null,
    price: priceText,
    priceGuide: parsePrice(priceText),
    listingType: (details.listingMethod as string) === 'auction' ? 'auction' : 'sale',
    auctionDate: (details.auction as Record<string, string>)?.date || null,
    daysOnMarket: null, // REA doesn't expose this consistently
    description: (details.description as string) || '',
    features: [],
    images: [],
    agentName: null,
    agencyName: null,
    suburbMedianPrice: null,
    suburbMedianRent: null,
    suburbDaysOnMarket: null,
    suburbAuctionClearance: null,
    rawData: argonautData,
  };
}

/**
 * Scrape a listing from a URL. Detects the source and uses the appropriate parser.
 */
export async function scrapeListing(url: string): Promise<ListingData> {
  const html = await fetchHtml(url);

  if (url.includes('domain.com.au')) {
    return parseDomainListing(html, url);
  }
  if (url.includes('realestate.com.au')) {
    return parseReaListing(html, url);
  }

  throw new Error(`Unsupported listing URL: ${url}`);
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/extractors/listing-scraper.test.ts`
Expected: PASS

**Step 5: Export from pipeline package**

Add to `packages/pipeline/package.json` exports:
```json
"./listing": "./src/pipeline/extractors/listing-scraper.ts",
"./listing-types": "./src/pipeline/extractors/listing-types.ts"
```

**Step 6: Commit**

```bash
git add packages/pipeline/src/pipeline/extractors/listing-scraper.ts packages/pipeline/src/pipeline/extractors/listing-scraper.test.ts packages/pipeline/package.json
git commit -m "feat: add listing scraper for domain.com.au and realestate.com.au"
```

---

### Task 3: Listing Scrape API Route

**Files:**
- Create: `packages/web/src/app/api/listing/scrape/route.ts`

**Step 1: Create the API route**

```typescript
// packages/web/src/app/api/listing/scrape/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const { scrapeListing } = await import('@ilre/pipeline/listing');
    const listing = await scrapeListing(url);

    return NextResponse.json({
      listing,
      scrapedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Listing scrape error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scrape failed' },
      { status: 500 }
    );
  }
}
```

**Step 2: Run typecheck**

Run: `cd /Users/reidbates/dev/ilragents/packages/web && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/web/src/app/api/listing/scrape/route.ts
git commit -m "feat: add listing scrape API route"
```

---

### Task 4: Deal Analyser Dan - Agent Registration

**Files:**
- Modify: `packages/web/src/lib/agents.ts`
- Modify: `packages/pipeline/src/pipeline/chat.ts`
- Modify: `packages/pipeline/src/pipeline/chat.test.ts`
- Modify: `packages/web/src/components/ChatPanel.tsx` (AGENT_BRIEF_KEYS)

**Step 1: Add Dan to agents.ts**

In `packages/web/src/lib/agents.ts`, add to the AGENTS array before the closing `]`:

```typescript
{
  id: "deal-analyser-dan",
  name: "Deal Analyser Dan",
  domain: "Deal Analysis & Assessment",
  description:
    "Paste a property listing URL or address and Dan will scrape the data, pull in your financial position, and walk you through an ILR deal assessment.",
  color: "#F59E0B",
  avatarUrl:
    "https://api.dicebear.com/9.x/adventurer/svg?seed=DealAnalyserDan&backgroundColor=F59E0B&skinColor=f2d3b1",
  ragAgents: ["Finder Fred", "Foundation Frank", "Yield Yates", "ILR Methodology"],
  contextLimit: 25,
},
```

**Step 2: Add Dan's alias in chat.ts**

In `packages/pipeline/src/pipeline/chat.ts`, add to AGENT_ALIASES:

```typescript
'Deal Analyser Dan': ['Finder Fred', 'Foundation Frank', 'Yield Yates', 'ILR Methodology'],
```

**Step 3: Add Dan's brief key in ChatPanel.tsx**

In `packages/web/src/components/ChatPanel.tsx`, add to AGENT_BRIEF_KEYS:

```typescript
"deal-analyser-dan": "finderFred", // uses Finder Fred's brief as closest match
```

**Step 4: Update chat.test.ts with Dan's alias test**

Add to the `AGENT_ALIASES` describe block in `packages/pipeline/src/pipeline/chat.test.ts`:

```typescript
it('maps Deal Analyser Dan to four agents', () => {
  expect(AGENT_ALIASES['Deal Analyser Dan']).toHaveLength(4);
  expect(AGENT_ALIASES['Deal Analyser Dan']).toContain('Finder Fred');
  expect(AGENT_ALIASES['Deal Analyser Dan']).toContain('Foundation Frank');
  expect(AGENT_ALIASES['Deal Analyser Dan']).toContain('Yield Yates');
  expect(AGENT_ALIASES['Deal Analyser Dan']).toContain('ILR Methodology');
});
```

**Step 5: Run tests**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/chat.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/web/src/lib/agents.ts packages/pipeline/src/pipeline/chat.ts packages/pipeline/src/pipeline/chat.test.ts packages/web/src/components/ChatPanel.tsx
git commit -m "feat: register Deal Analyser Dan agent"
```

---

### Task 5: Dan's Custom System Prompt

**Files:**
- Create: `packages/web/src/lib/deal-analyser-prompt.ts`

**Step 1: Create the system prompt**

```typescript
// packages/web/src/lib/deal-analyser-prompt.ts

/**
 * Deal Analyser Dan's custom system prompt.
 * Used as systemPromptOverride when the chat route detects Dan is the active agent.
 * The listing data and financial context are appended separately by the chat route.
 */
export const DEAL_ANALYSER_SYSTEM_PROMPT = `You are Deal Analyser Dan, an ILR (I Love Real Estate) trained deal analysis specialist for Australian property investment. Your role is to help investors evaluate specific property deals using ILR methodology.

WHAT YOU DO:
When a client shares a property listing (URL or address), you analyse it through the lens of ILR strategy. You combine the property data with the client's financial position to give a grounded, practical deal assessment. You are not a generic property advisor - you apply ILR frameworks specifically.

YOUR ANALYSIS FRAMEWORK:
1. IDENTIFY THE OPPORTUNITY - What is this property? What does the data tell you? (price, land size, location, condition indicators from the description)
2. ASK THE STRATEGY QUESTION - What strategy is the client considering? This determines the entire analysis:
   - CHUNK DEAL (manufactured growth): Reno flip, subdivision, development, knock-down rebuild
   - INCOME DEAL (cash cow): Buy and hold for cashflow, granny flat addition, dual-occ, rooming house
   - STACKED STRATEGY: Combination (e.g. reno + subdivide + hold)
   - NOT SURE: Help them think through which strategy fits based on the property characteristics and their position
3. RUN THE NUMBERS:
   - For CHUNK deals: Apply FISO (Financial Feasibility) - Profit = End Value - Total Costs. Calculate Cash on Cash Return and % Profit on Development Cost. Ask for reno/strategy budget and expected end value.
   - For INCOME deals: Cashflow analysis - Gross rental income minus ALL holding costs (mortgage interest, rates, insurance, management, maintenance, body corp). Calculate Gross Yield and Net Yield.
   - For ALL deals: Sensitivity analysis - stress test interest rates (+2%), rent reduction (-10%), vacancy (8 weeks), and combined stress. A deal that only works under ideal conditions is not solid.
4. CHECK CAPACITY - Reference the client's financial position: Do they have the cash, equity, and serviceability for this deal? Accessible equity = total equity x 80%. Rough serviceability = (income x 6) - existing loans.
5. ASSESS FIT - Does this deal match where they are in their ILR journey? If capacity is limited, chunk deals first to build resources. Income deals tie up capacity; chunks grow it.

LISTING DATA:
When listing data is provided in your context (marked as PROPERTY LISTING DATA), use it directly. Present key facts naturally - don't dump the raw data. Highlight what matters for the strategy assessment.

KEY QUESTIONS TO ASK (don't ask all at once - 1-2 at a time):
- What strategy are you thinking? Chunk, income, or not sure yet?
- What purchase price are you targeting? (if listed as range or Contact Agent)
- What reno/strategy budget are you working with? (for chunk deals)
- What rent do you expect to achieve? (if not evident from market data)
- What's your exit strategy if things don't go to plan?
- Have you spoken to your broker about serviceability for this one?

WHAT YOU MUST NOT DO:
- Don't give generic "this looks like a good area" advice. Be specific using the data.
- Don't skip the numbers. Every deal assessment must include at least a rough yield or FISO calculation.
- Don't recommend a deal without checking it against the client's financial position.
- Don't forget sensitivity analysis. ILR demands stress testing.
- Don't use the word "mate".

HOW TO BEHAVE:
- Be direct, practical, Australian in tone
- Present analysis as your own expertise - never reference "materials" or "sources"
- If data is missing, say what you need and give a preliminary view based on what you have
- Always give something useful even when asking for more info
- Include specialist referrals (finance, accounting) when the conversation touches lending or tax

SPECIALIST REFERRALS:
Include when relevant. Format: <!--REFERRAL:{"team":"finance"|"accounting"|"asset-protection"|"legal","reason":"brief reason","suggestedSubject":"email subject"}-->
Do NOT mention referrals in your conversational text - the system renders them automatically.`;

/**
 * Format listing data as a context block for injection into the system prompt
 */
export function buildListingDataBlock(listing: Record<string, unknown>): string {
  return \`
── PROPERTY LISTING DATA ─────────────────────────────────
\${JSON.stringify(listing, null, 2)}
──────────────────────────────────────────────────────────\`;
}
```

**Step 2: Run typecheck**

Run: `cd /Users/reidbates/dev/ilragents/packages/web && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/web/src/lib/deal-analyser-prompt.ts
git commit -m "feat: add Deal Analyser Dan system prompt"
```

---

### Task 6: URL Detection in Chat Stream Route

**Files:**
- Modify: `packages/web/src/app/api/chat/stream/route.ts`

**Step 1: Add listing detection and scraping to the chat stream**

Modify `packages/web/src/app/api/chat/stream/route.ts` to detect listing URLs when the agent is Deal Analyser Dan, scrape the listing, and inject the data into the system prompt:

After the existing `mode === "onboarding"` block (line 42), add a new block for deal analysis mode:

```typescript
// In deal analysis mode, detect listing URLs and scrape them
if (agent === "Deal Analyser Dan") {
  const { detectListingUrl } = await import("@ilre/pipeline/listing-types");
  const detected = detectListingUrl(query);

  if (detected) {
    try {
      const { scrapeListing } = await import("@ilre/pipeline/listing");
      const listing = await scrapeListing(detected.url);
      const { DEAL_ANALYSER_SYSTEM_PROMPT, buildListingDataBlock } = await import("@/lib/deal-analyser-prompt");

      // Combine Dan's prompt with listing data
      systemPromptOverride = DEAL_ANALYSER_SYSTEM_PROMPT + "\n\n" + buildListingDataBlock(listing);
    } catch (scrapeError) {
      console.error("Listing scrape failed:", scrapeError);
      // Fall through to Dan's prompt without listing data - he'll work with what the user typed
      const { DEAL_ANALYSER_SYSTEM_PROMPT } = await import("@/lib/deal-analyser-prompt");
      systemPromptOverride = DEAL_ANALYSER_SYSTEM_PROMPT;
    }
  } else if (!systemPromptOverride) {
    // No URL detected, but still use Dan's custom prompt
    const { DEAL_ANALYSER_SYSTEM_PROMPT } = await import("@/lib/deal-analyser-prompt");
    systemPromptOverride = DEAL_ANALYSER_SYSTEM_PROMPT;
  }
}
```

**Step 2: Run typecheck**

Run: `cd /Users/reidbates/dev/ilragents/packages/web && npx tsc --noEmit`
Expected: PASS

**Step 3: Manual test**

Run: `cd /Users/reidbates/dev/ilragents && npm run -w packages/web dev`
1. Navigate to Deal Analyser Dan in the UI
2. Paste a domain.com.au listing URL
3. Verify Dan's response references the property details from the listing
4. Verify Dan asks about strategy intent

**Step 4: Commit**

```bash
git add packages/web/src/app/api/chat/stream/route.ts
git commit -m "feat: add URL detection and listing scrape to chat stream for Dan"
```

---

### Task 7: FISO Calculator Module

**Files:**
- Create: `packages/pipeline/src/pipeline/calculators/fiso-calculator.ts`
- Create: `packages/pipeline/src/pipeline/calculators/fiso-calculator.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/pipeline/src/pipeline/calculators/fiso-calculator.test.ts
import { describe, it, expect } from 'vitest';
import { calculateFISO } from './fiso-calculator';
import type { FISOInput } from './fiso-calculator';

describe('calculateFISO', () => {
  const baseInput: FISOInput = {
    purchasePrice: 500000,
    purchaseCosts: 25000, // stamp duty, legal, inspections
    holdingCosts: 15000,  // 6 months of mortgage, rates, insurance
    strategyCosts: 50000, // reno budget
    sellingCosts: 20000,  // agent commission + marketing
    endValue: 700000,
    ownerFundsContributed: 150000,
    projectDurationMonths: 6,
  };

  it('calculates profit correctly', () => {
    const result = calculateFISO(baseInput);
    // Profit = 700000 - (500000 + 25000 + 15000 + 50000 + 20000) = 90000
    expect(result.profit).toBe(90000);
  });

  it('calculates total costs correctly', () => {
    const result = calculateFISO(baseInput);
    expect(result.totalCosts).toBe(610000);
  });

  it('calculates cash on cash return correctly', () => {
    const result = calculateFISO(baseInput);
    // CoC = (90000 / 150000) * 100 = 60%
    expect(result.cashOnCashReturn).toBeCloseTo(60, 1);
  });

  it('calculates profit on development cost correctly', () => {
    const result = calculateFISO(baseInput);
    // % = 90000 / (610000 - 20000) * 100 = 90000 / 590000 * 100 = 15.25%
    expect(result.profitOnDevelopmentCost).toBeCloseTo(15.25, 1);
  });

  it('calculates per annum correctly for 6 month project', () => {
    const result = calculateFISO(baseInput);
    // profitPerAnnum = 15.25% / 0.5 years = 30.5% p.a.
    expect(result.profitPerAnnum).toBeCloseTo(30.5, 0);
  });

  it('flags as viable when profit is positive', () => {
    const result = calculateFISO(baseInput);
    expect(result.isViable).toBe(true);
  });

  it('flags as not viable when profit is negative', () => {
    const result = calculateFISO({ ...baseInput, endValue: 580000 });
    expect(result.isViable).toBe(false);
  });

  it('includes viability note for commercial threshold', () => {
    const result = calculateFISO(baseInput);
    // 15.25% is below 20% commercial threshold
    expect(result.viabilityNotes.some(n => n.includes('20%'))).toBe(true);
  });

  it('handles GST for commercial projects', () => {
    const input: FISOInput = { ...baseInput, gst: 60000 };
    const result = calculateFISO(input);
    // % = 90000 / (610000 - 20000 - 60000) * 100 = 90000 / 530000 = 16.98%
    expect(result.profitOnDevelopmentCost).toBeCloseTo(16.98, 1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/calculators/fiso-calculator.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// packages/pipeline/src/pipeline/calculators/fiso-calculator.ts

export interface FISOInput {
  purchasePrice: number;
  purchaseCosts: number;
  holdingCosts: number;
  strategyCosts: number;
  sellingCosts: number;
  endValue: number;
  ownerFundsContributed: number;
  projectDurationMonths: number;
  gst?: number;
}

export interface FISOOutput {
  profit: number;
  cashOnCashReturn: number;
  profitOnDevelopmentCost: number;
  profitPerAnnum: number;
  totalCosts: number;
  isViable: boolean;
  viabilityNotes: string[];
}

export function calculateFISO(input: FISOInput): FISOOutput {
  const totalCosts =
    input.purchasePrice +
    input.purchaseCosts +
    input.holdingCosts +
    input.strategyCosts +
    input.sellingCosts;

  const profit = input.endValue - totalCosts;

  const cashOnCashReturn =
    input.ownerFundsContributed > 0
      ? (profit / input.ownerFundsContributed) * 100
      : 0;

  const developmentCostBase = totalCosts - input.sellingCosts - (input.gst || 0);
  const profitOnDevelopmentCost =
    developmentCostBase > 0 ? (profit / developmentCostBase) * 100 : 0;

  const projectYears = input.projectDurationMonths / 12;
  const profitPerAnnum =
    projectYears > 0 ? profitOnDevelopmentCost / projectYears : 0;

  const viabilityNotes: string[] = [];

  if (profit <= 0) {
    viabilityNotes.push('Deal produces a loss. Not viable.');
  }
  if (profitOnDevelopmentCost < 20) {
    viabilityNotes.push(
      `Profit on development cost is ${profitOnDevelopmentCost.toFixed(1)}% - below the 20% minimum threshold for commercial/multi-unit projects.`
    );
  }
  if (cashOnCashReturn < 15) {
    viabilityNotes.push(
      `Cash on cash return is ${cashOnCashReturn.toFixed(1)}% - relatively low return on your cash invested.`
    );
  }

  return {
    profit,
    cashOnCashReturn,
    profitOnDevelopmentCost,
    profitPerAnnum,
    totalCosts,
    isViable: profit > 0,
    viabilityNotes,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/calculators/fiso-calculator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/calculators/fiso-calculator.ts packages/pipeline/src/pipeline/calculators/fiso-calculator.test.ts
git commit -m "feat: add FISO calculator module with ILR methodology"
```

---

### Task 8: Cashflow Calculator Module

**Files:**
- Create: `packages/pipeline/src/pipeline/calculators/cashflow-calculator.ts`
- Create: `packages/pipeline/src/pipeline/calculators/cashflow-calculator.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/pipeline/src/pipeline/calculators/cashflow-calculator.test.ts
import { describe, it, expect } from 'vitest';
import { calculateCashflow } from './cashflow-calculator';
import type { CashflowInput } from './cashflow-calculator';

describe('calculateCashflow', () => {
  const baseInput: CashflowInput = {
    purchasePrice: 500000,
    weeklyRent: 500,
    mortgageRate: 6.5,
    lvr: 80,
    councilRates: 2000,
    insurance: 1500,
    managementFee: 8,
    maintenanceAllowance: 1,
  };

  it('calculates gross rental income correctly', () => {
    const result = calculateCashflow(baseInput);
    // 500 * 52 = 26000
    expect(result.grossRentalIncome).toBe(26000);
  });

  it('calculates gross yield correctly', () => {
    const result = calculateCashflow(baseInput);
    // 26000 / 500000 * 100 = 5.2%
    expect(result.grossYield).toBeCloseTo(5.2, 1);
  });

  it('calculates mortgage interest correctly', () => {
    const result = calculateCashflow(baseInput);
    // Loan = 500000 * 0.80 = 400000. Interest = 400000 * 0.065 = 26000
    // Total holding = 26000 + 2000 + 1500 + (26000 * 0.08) + (500000 * 0.01) = 26000 + 2000 + 1500 + 2080 + 5000 = 36580
    expect(result.totalHoldingCosts).toBeCloseTo(36580, 0);
  });

  it('calculates net annual cashflow', () => {
    const result = calculateCashflow(baseInput);
    // 26000 - 36580 = -10580
    expect(result.netAnnualCashflow).toBeCloseTo(-10580, 0);
  });

  it('identifies negative cashflow correctly', () => {
    const result = calculateCashflow(baseInput);
    expect(result.isPositive).toBe(false);
  });

  it('identifies positive cashflow when rent is high enough', () => {
    const result = calculateCashflow({ ...baseInput, weeklyRent: 800 });
    expect(result.isPositive).toBe(true);
  });

  it('calculates break-even rent', () => {
    const result = calculateCashflow(baseInput);
    // Break-even rent = holdingCosts / 52 / (1 - managementFee/100)
    // But simpler: what weekly rent makes net = 0
    expect(result.breakEvenRent).toBeGreaterThan(500);
    expect(result.breakEvenRent).toBeLessThan(800);
  });

  it('includes body corp fees when provided', () => {
    const withBC = calculateCashflow({ ...baseInput, bodyCorpFees: 3000 });
    const without = calculateCashflow(baseInput);
    expect(withBC.totalHoldingCosts).toBe(without.totalHoldingCosts + 3000);
  });

  it('handles multiple doors', () => {
    const result = calculateCashflow({ ...baseInput, numberOfDoors: 2 });
    expect(result.grossRentalIncome).toBe(52000); // 500 * 52 * 2
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/calculators/cashflow-calculator.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// packages/pipeline/src/pipeline/calculators/cashflow-calculator.ts

export interface CashflowInput {
  purchasePrice: number;
  weeklyRent: number;
  mortgageRate: number;
  lvr: number;
  councilRates: number;
  insurance: number;
  managementFee: number;
  maintenanceAllowance: number;
  bodyCorpFees?: number;
  waterSewer?: number;
  otherCosts?: number;
  numberOfDoors?: number;
}

export interface CashflowOutput {
  grossRentalIncome: number;
  totalHoldingCosts: number;
  netAnnualCashflow: number;
  grossYield: number;
  netYield: number;
  weeklyNetCashflow: number;
  isPositive: boolean;
  breakEvenRent: number;
}

export function calculateCashflow(input: CashflowInput): CashflowOutput {
  const doors = input.numberOfDoors || 1;
  const grossRentalIncome = input.weeklyRent * 52 * doors;

  const loanAmount = input.purchasePrice * (input.lvr / 100);
  const annualMortgageInterest = loanAmount * (input.mortgageRate / 100);
  const annualManagement = grossRentalIncome * (input.managementFee / 100);
  const annualMaintenance = input.purchasePrice * (input.maintenanceAllowance / 100);

  const totalHoldingCosts =
    annualMortgageInterest +
    input.councilRates +
    input.insurance +
    annualManagement +
    annualMaintenance +
    (input.bodyCorpFees || 0) +
    (input.waterSewer || 0) +
    (input.otherCosts || 0);

  const netAnnualCashflow = grossRentalIncome - totalHoldingCosts;
  const grossYield = (grossRentalIncome / input.purchasePrice) * 100;
  const netYield = (netAnnualCashflow / input.purchasePrice) * 100;
  const weeklyNetCashflow = netAnnualCashflow / 52;

  // Break-even rent: solve for weeklyRent where net cashflow = 0
  // netCashflow = (weeklyRent * 52 * doors) - managementFee% * (weeklyRent * 52 * doors) - fixedCosts = 0
  // weeklyRent * 52 * doors * (1 - managementFee/100) = fixedCosts
  const fixedCosts =
    annualMortgageInterest +
    input.councilRates +
    input.insurance +
    annualMaintenance +
    (input.bodyCorpFees || 0) +
    (input.waterSewer || 0) +
    (input.otherCosts || 0);
  const rentMultiplier = 52 * doors * (1 - input.managementFee / 100);
  const breakEvenRent = rentMultiplier > 0 ? fixedCosts / rentMultiplier : 0;

  return {
    grossRentalIncome,
    totalHoldingCosts,
    netAnnualCashflow,
    grossYield,
    netYield,
    weeklyNetCashflow,
    isPositive: netAnnualCashflow > 0,
    breakEvenRent: Math.ceil(breakEvenRent),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/calculators/cashflow-calculator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/calculators/cashflow-calculator.ts packages/pipeline/src/pipeline/calculators/cashflow-calculator.test.ts
git commit -m "feat: add cashflow calculator module with ILR methodology"
```

---

### Task 9: Sensitivity Engine Module

**Files:**
- Create: `packages/pipeline/src/pipeline/calculators/sensitivity-engine.ts`
- Create: `packages/pipeline/src/pipeline/calculators/sensitivity-engine.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/pipeline/src/pipeline/calculators/sensitivity-engine.test.ts
import { describe, it, expect } from 'vitest';
import { runSensitivityAnalysis } from './sensitivity-engine';
import type { CashflowInput } from './cashflow-calculator';

describe('runSensitivityAnalysis', () => {
  const baseInput: CashflowInput = {
    purchasePrice: 500000,
    weeklyRent: 600,
    mortgageRate: 6.0,
    lvr: 80,
    councilRates: 2000,
    insurance: 1500,
    managementFee: 8,
    maintenanceAllowance: 1,
  };

  it('stress tests interest rate increases', () => {
    const result = runSensitivityAnalysis(baseInput);
    expect(result.rateStress.currentRate).toBe(6.0);
    expect(result.rateStress.plus1.netAnnualCashflow).toBeLessThan(
      result.rateStress.plus1.grossRentalIncome // sanity - costs went up
    );
    expect(result.rateStress.plus2.netAnnualCashflow).toBeLessThan(
      result.rateStress.plus1.netAnnualCashflow
    );
    expect(result.rateStress.plus3.netAnnualCashflow).toBeLessThan(
      result.rateStress.plus2.netAnnualCashflow
    );
  });

  it('calculates break-even rate', () => {
    const result = runSensitivityAnalysis(baseInput);
    expect(result.rateStress.breakEvenRate).toBeGreaterThan(6.0);
  });

  it('stress tests rent reductions', () => {
    const result = runSensitivityAnalysis(baseInput);
    expect(result.rentStress.minus10pct.grossRentalIncome).toBeLessThan(
      result.rentStress.currentRent * 52
    );
    expect(result.rentStress.minus20pct.grossRentalIncome).toBeLessThan(
      result.rentStress.minus10pct.grossRentalIncome
    );
  });

  it('stress tests vacancy periods', () => {
    const result = runSensitivityAnalysis(baseInput);
    expect(result.vacancyStress.weeksVacancyToBreakEven).toBeGreaterThan(0);
    expect(result.vacancyStress.at4Weeks.netAnnualCashflow).toBeLessThan(
      result.vacancyStress.at4Weeks.grossRentalIncome
    );
  });

  it('runs combined stress test', () => {
    const result = runSensitivityAnalysis(baseInput);
    // Combined: rate +2% AND rent -10% should be worse than either alone
    expect(result.combinedStress.netAnnualCashflow).toBeLessThan(
      result.rateStress.plus2.netAnnualCashflow
    );
  });

  it('classifies resilience', () => {
    const result = runSensitivityAnalysis(baseInput);
    expect(['strong', 'moderate', 'fragile']).toContain(result.resilience);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/calculators/sensitivity-engine.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// packages/pipeline/src/pipeline/calculators/sensitivity-engine.ts
import { calculateCashflow } from './cashflow-calculator';
import type { CashflowInput, CashflowOutput } from './cashflow-calculator';

export interface SensitivityOutput {
  rateStress: {
    currentRate: number;
    plus1: CashflowOutput;
    plus2: CashflowOutput;
    plus3: CashflowOutput;
    breakEvenRate: number;
  };
  rentStress: {
    currentRent: number;
    minus10pct: CashflowOutput;
    minus20pct: CashflowOutput;
    breakEvenRent: number;
  };
  vacancyStress: {
    weeksVacancyToBreakEven: number;
    at4Weeks: CashflowOutput;
    at8Weeks: CashflowOutput;
    at12Weeks: CashflowOutput;
  };
  combinedStress: CashflowOutput;
  resilience: 'strong' | 'moderate' | 'fragile';
  resilienceNotes: string[];
}

function withRate(input: CashflowInput, newRate: number): CashflowOutput {
  return calculateCashflow({ ...input, mortgageRate: newRate });
}

function withRent(input: CashflowInput, newWeeklyRent: number): CashflowOutput {
  return calculateCashflow({ ...input, weeklyRent: newWeeklyRent });
}

function withVacancy(input: CashflowInput, vacantWeeks: number): CashflowOutput {
  const occupiedWeeks = 52 - vacantWeeks;
  const adjustedRent = (input.weeklyRent * occupiedWeeks) / 52;
  return calculateCashflow({ ...input, weeklyRent: adjustedRent });
}

function findBreakEvenRate(input: CashflowInput): number {
  // Binary search for the rate at which cashflow hits zero
  let low = input.mortgageRate;
  let high = input.mortgageRate + 10;
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const cf = calculateCashflow({ ...input, mortgageRate: mid });
    if (cf.netAnnualCashflow > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return Math.round(((low + high) / 2) * 100) / 100;
}

function findVacancyBreakEven(input: CashflowInput): number {
  // How many weeks of vacancy before cashflow = 0
  const baseline = calculateCashflow(input);
  if (baseline.netAnnualCashflow <= 0) return 0;

  for (let weeks = 1; weeks <= 52; weeks++) {
    const cf = withVacancy(input, weeks);
    if (cf.netAnnualCashflow <= 0) return weeks;
  }
  return 52;
}

export function runSensitivityAnalysis(input: CashflowInput): SensitivityOutput {
  const baseline = calculateCashflow(input);

  const rateStress = {
    currentRate: input.mortgageRate,
    plus1: withRate(input, input.mortgageRate + 1),
    plus2: withRate(input, input.mortgageRate + 2),
    plus3: withRate(input, input.mortgageRate + 3),
    breakEvenRate: findBreakEvenRate(input),
  };

  const rentStress = {
    currentRent: input.weeklyRent,
    minus10pct: withRent(input, input.weeklyRent * 0.9),
    minus20pct: withRent(input, input.weeklyRent * 0.8),
    breakEvenRent: baseline.breakEvenRent,
  };

  const vacancyStress = {
    weeksVacancyToBreakEven: findVacancyBreakEven(input),
    at4Weeks: withVacancy(input, 4),
    at8Weeks: withVacancy(input, 8),
    at12Weeks: withVacancy(input, 12),
  };

  // Combined: rate +2% AND rent -10%
  const combinedStress = calculateCashflow({
    ...input,
    mortgageRate: input.mortgageRate + 2,
    weeklyRent: input.weeklyRent * 0.9,
  });

  // Classify resilience
  const resilienceNotes: string[] = [];
  let failCount = 0;

  if (rateStress.plus2.netAnnualCashflow < 0) {
    failCount++;
    resilienceNotes.push('Cashflow turns negative with a 2% rate increase.');
  }
  if (rentStress.minus10pct.netAnnualCashflow < 0) {
    failCount++;
    resilienceNotes.push('Cashflow turns negative with a 10% rent reduction.');
  }
  if (vacancyStress.weeksVacancyToBreakEven < 4) {
    failCount++;
    resilienceNotes.push(`Only ${vacancyStress.weeksVacancyToBreakEven} weeks of vacancy wipes out annual cashflow.`);
  }
  if (combinedStress.netAnnualCashflow < -5000) {
    failCount++;
    resilienceNotes.push('Combined stress (rate +2%, rent -10%) produces significant losses.');
  }

  const resilience: 'strong' | 'moderate' | 'fragile' =
    failCount === 0 ? 'strong' : failCount <= 2 ? 'moderate' : 'fragile';

  if (resilience === 'strong') {
    resilienceNotes.push('Deal survives all standard stress tests. Solid fundamentals.');
  }

  return {
    rateStress,
    rentStress,
    vacancyStress,
    combinedStress,
    resilience,
    resilienceNotes,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/calculators/sensitivity-engine.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/calculators/sensitivity-engine.ts packages/pipeline/src/pipeline/calculators/sensitivity-engine.test.ts
git commit -m "feat: add sensitivity engine with 4-dimension ILR stress testing"
```

---

### Task 10: Capacity Calculator Module

**Files:**
- Create: `packages/pipeline/src/pipeline/calculators/capacity-calculator.ts`
- Create: `packages/pipeline/src/pipeline/calculators/capacity-calculator.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/pipeline/src/pipeline/calculators/capacity-calculator.test.ts
import { describe, it, expect } from 'vitest';
import { calculateCapacity } from './capacity-calculator';

describe('calculateCapacity', () => {
  const baseInput = {
    totalPropertyValue: 1200000,
    totalLoans: 600000,
    cashSavings: 80000,
    annualIncome: 150000,
    existingLoanRepayments: 600000,
    bufferReserve: 20000,
  };

  it('calculates total equity correctly', () => {
    const result = calculateCapacity(baseInput);
    expect(result.totalEquity).toBe(600000);
  });

  it('calculates accessible equity at 80%', () => {
    const result = calculateCapacity(baseInput);
    // (1200000 * 0.8) - 600000 = 360000
    expect(result.accessibleEquity).toBe(360000);
  });

  it('calculates available funds correctly', () => {
    const result = calculateCapacity(baseInput);
    // 360000 + 80000 - 20000 = 420000
    expect(result.availableFunds).toBe(420000);
  });

  it('calculates borrowing capacity correctly', () => {
    const result = calculateCapacity(baseInput);
    // (150000 * 6) - 600000 = 300000
    expect(result.borrowingCapacity).toBe(300000);
  });

  it('correctly assesses if user can afford a deal', () => {
    const result = calculateCapacity(baseInput);
    expect(result.canAffordDeal(400000)).toBe(true);
    expect(result.canAffordDeal(500000)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/calculators/capacity-calculator.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

```typescript
// packages/pipeline/src/pipeline/calculators/capacity-calculator.ts

export interface CapacityInput {
  totalPropertyValue: number;
  totalLoans: number;
  cashSavings: number;
  annualIncome: number;
  existingLoanRepayments: number;
  bufferReserve: number;
}

export interface CapacityOutput {
  totalEquity: number;
  accessibleEquity: number;
  availableFunds: number;
  borrowingCapacity: number;
  maxPurchasePrice: number;
  canAffordDeal: (purchasePrice: number) => boolean;
}

export function calculateCapacity(input: CapacityInput): CapacityOutput {
  const totalEquity = input.totalPropertyValue - input.totalLoans;

  // Accessible equity: what the bank will lend against (80% LVR)
  const maxLendableValue = input.totalPropertyValue * 0.8;
  const accessibleEquity = Math.max(0, maxLendableValue - input.totalLoans);

  const availableFunds = accessibleEquity + input.cashSavings - input.bufferReserve;

  // Rough serviceability: income x 6 minus existing loan commitments
  const borrowingCapacity = Math.max(0, input.annualIncome * 6 - input.existingLoanRepayments);

  // Max purchase price is the lower of available funds (for deposit + costs)
  // and borrowing capacity. Rough guide: available funds covers 20% deposit + 5% costs
  const maxFromFunds = availableFunds / 0.25; // 25% of purchase price needed
  const maxPurchasePrice = Math.min(maxFromFunds, borrowingCapacity);

  return {
    totalEquity,
    accessibleEquity,
    availableFunds,
    borrowingCapacity,
    maxPurchasePrice: Math.round(maxPurchasePrice),
    canAffordDeal: (purchasePrice: number) => purchasePrice <= maxPurchasePrice,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/calculators/capacity-calculator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/calculators/capacity-calculator.ts packages/pipeline/src/pipeline/calculators/capacity-calculator.test.ts
git commit -m "feat: add capacity calculator with ILR Know Your Numbers framework"
```

---

### Task 11: Calculator Barrel Export

**Files:**
- Create: `packages/pipeline/src/pipeline/calculators/index.ts`
- Modify: `packages/pipeline/package.json`

**Step 1: Create barrel export**

```typescript
// packages/pipeline/src/pipeline/calculators/index.ts
export { calculateFISO } from './fiso-calculator';
export type { FISOInput, FISOOutput } from './fiso-calculator';

export { calculateCashflow } from './cashflow-calculator';
export type { CashflowInput, CashflowOutput } from './cashflow-calculator';

export { runSensitivityAnalysis } from './sensitivity-engine';
export type { SensitivityOutput } from './sensitivity-engine';

export { calculateCapacity } from './capacity-calculator';
export type { CapacityInput, CapacityOutput } from './capacity-calculator';
```

**Step 2: Add export to pipeline package.json**

Add to `packages/pipeline/package.json` exports:
```json
"./calculators": "./src/pipeline/calculators/index.ts"
```

**Step 3: Run all calculator tests**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/calculators/`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/pipeline/src/pipeline/calculators/index.ts packages/pipeline/package.json
git commit -m "feat: add calculator barrel export"
```

---

### Task 12: FISO Phil - Agent Registration

**Files:**
- Modify: `packages/web/src/lib/agents.ts`
- Modify: `packages/pipeline/src/pipeline/chat.ts`
- Modify: `packages/pipeline/src/pipeline/chat.test.ts`
- Modify: `packages/web/src/components/ChatPanel.tsx`
- Create: `packages/web/src/lib/fiso-phil-prompt.ts`

**Step 1: Add FISO Phil to agents.ts**

In `packages/web/src/lib/agents.ts`, add to the AGENTS array:

```typescript
{
  id: "fiso-phil",
  name: "FISO Phil",
  domain: "Deal Calculator & Feasibility",
  description:
    "Run the numbers. Phil takes a property deal and produces a full ILR feasibility report - FISO analysis, cashflow modelling, sensitivity testing, and capacity check.",
  color: "#EF4444",
  avatarUrl:
    "https://api.dicebear.com/9.x/adventurer/svg?seed=FISOPhil&backgroundColor=EF4444&skinColor=ecad80",
  ragAgents: ["Foundation Frank", "ILR Methodology"],
  contextLimit: 15,
},
```

**Step 2: Add Phil's alias in chat.ts**

```typescript
'FISO Phil': ['Foundation Frank', 'Yield Yates', 'ILR Methodology'],
```

**Step 3: Add Phil's brief key in ChatPanel.tsx**

```typescript
"fiso-phil": "finderFred",
```

**Step 4: Create Phil's system prompt**

```typescript
// packages/web/src/lib/fiso-phil-prompt.ts

export const FISO_PHIL_SYSTEM_PROMPT = `You are FISO Phil, an ILR (I Love Real Estate) trained feasibility analysis specialist. You run the numbers on property deals using ILR methodology and produce structured, data-driven assessments.

YOUR ROLE:
You are a numbers-first analyst. When a client shares a property deal, you systematically collect the required inputs and run ILR financial feasibility calculations. You produce clear, structured analysis - not vague opinions.

YOUR PROCESS:
1. COLLECT INPUTS - When a listing is provided, extract what you can. Then ask for what's missing:
   - Strategy type: Chunk (reno/subdivision/development) or Income (buy and hold)?
   - Purchase price (if not clear from listing)
   - For CHUNK deals: strategy budget (reno/construction cost) and expected end value
   - For INCOME deals: expected weekly rent, management fee rate
   - For ALL deals: estimated holding costs (rates, insurance)

2. RUN CALCULATIONS - Once you have enough data, present results in this structure:

   **FISO ANALYSIS** (for chunk deals):
   - Total Costs breakdown (purchase + purchase costs + hold costs + strategy costs + selling costs)
   - Profit = End Value - Total Costs
   - Cash on Cash Return = (Profit / Cash In) x 100
   - % Profit on Development Cost = Profit / (Costs - Selling - GST) x 100
   - Per Annum = above % / project duration in years
   - Viability check: Is this above the 20% threshold for multi-unit/commercial?

   **CASHFLOW ANALYSIS** (for income deals, and as backup exit for chunk deals):
   - Gross rental income
   - Holding costs breakdown (mortgage interest, rates, insurance, management, maintenance, body corp)
   - Net annual cashflow
   - Gross Yield and Net Yield
   - Weekly net position

   **SENSITIVITY ANALYSIS** (mandatory for all deals):
   - Interest rate stress: +1%, +2%, +3%
   - Rent reduction: -10%, -20%
   - Vacancy stress: 4, 8, 12 weeks
   - Combined: rate +2% AND rent -10%
   - Break-even rate and break-even rent
   - Resilience rating: Strong / Moderate / Fragile

   **CAPACITY CHECK** (if client financial data available):
   - Accessible equity (total equity x 80%)
   - Available deployment funds
   - Borrowing capacity (income x 6 - existing loans)
   - Can they afford this deal?

3. PROVIDE VERDICT - After the numbers, give a clear ILR-aligned verdict:
   - Is this deal viable?
   - Does it meet ILR thresholds?
   - Does it match the client's position and journey stage?
   - Key risks to watch

CALCULATION DEFAULTS (use when client doesn't specify):
- Purchase costs: 5% of purchase price (stamp duty + legal + inspections)
- Selling costs: 2.5% of end value + $5000 (agent commission + marketing + legal)
- Council rates: $2,000/year (adjust up for higher-value areas)
- Insurance: $1,500/year
- Management fee: 8% of gross rent
- Maintenance: 1% of property value per year
- Body corp: $0 unless apartment/townhouse (then estimate $4,000/year)
- Mortgage rate: use current RBA cash rate + 2.5% margin (or ask the client)
- LVR: 80% (standard)

FORMATTING:
- Use tables for calculation breakdowns
- Use bold for key numbers (profit, yield, verdict)
- Present sensitivity as a grid showing the stress scenarios
- Always show your working - clients need to see how you got there

WHAT YOU MUST NOT DO:
- Don't skip sensitivity analysis. Every deal gets stress tested.
- Don't give opinions without numbers to back them up.
- Don't use the word "mate".
- Don't reference your source materials.

SPECIALIST REFERRALS:
Include when relevant. Format: <!--REFERRAL:{"team":"finance"|"accounting"|"asset-protection"|"legal","reason":"brief reason","suggestedSubject":"email subject"}-->`;
```

**Step 5: Add Phil's alias test to chat.test.ts**

```typescript
it('maps FISO Phil to three agents', () => {
  expect(AGENT_ALIASES['FISO Phil']).toHaveLength(3);
  expect(AGENT_ALIASES['FISO Phil']).toContain('Foundation Frank');
  expect(AGENT_ALIASES['FISO Phil']).toContain('Yield Yates');
  expect(AGENT_ALIASES['FISO Phil']).toContain('ILR Methodology');
});
```

**Step 6: Add Phil's custom prompt to chat stream route**

In `packages/web/src/app/api/chat/stream/route.ts`, add after the Dan block:

```typescript
if (agent === "FISO Phil" && !systemPromptOverride) {
  const { detectListingUrl } = await import("@ilre/pipeline/listing-types");
  const detected = detectListingUrl(query);

  const { FISO_PHIL_SYSTEM_PROMPT } = await import("@/lib/fiso-phil-prompt");

  if (detected) {
    try {
      const { scrapeListing } = await import("@ilre/pipeline/listing");
      const listing = await scrapeListing(detected.url);
      const { buildListingDataBlock } = await import("@/lib/deal-analyser-prompt");
      systemPromptOverride = FISO_PHIL_SYSTEM_PROMPT + "\n\n" + buildListingDataBlock(listing);
    } catch {
      systemPromptOverride = FISO_PHIL_SYSTEM_PROMPT;
    }
  } else {
    systemPromptOverride = FISO_PHIL_SYSTEM_PROMPT;
  }
}
```

**Step 7: Run tests**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run src/pipeline/chat.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/web/src/lib/agents.ts packages/web/src/lib/fiso-phil-prompt.ts packages/pipeline/src/pipeline/chat.ts packages/pipeline/src/pipeline/chat.test.ts packages/web/src/components/ChatPanel.tsx packages/web/src/app/api/chat/stream/route.ts
git commit -m "feat: register FISO Phil agent with system prompt and calculator integration"
```

---

### Task 13: End-to-End Verification

**Step 1: Run all pipeline tests**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/pipeline vitest run`
Expected: All PASS

**Step 2: Run web typecheck**

Run: `cd /Users/reidbates/dev/ilragents && npx -w packages/web tsc --noEmit`
Expected: PASS

**Step 3: Start dev server and manual test**

Run: `cd /Users/reidbates/dev/ilragents && npm run -w packages/web dev`

1. Verify home page shows 6 agents (4 existing + Deal Analyser Dan + FISO Phil)
2. Open Deal Analyser Dan, paste a domain.com.au listing URL, verify he responds with listing-aware analysis
3. Open FISO Phil, paste same URL, verify he asks for inputs and produces structured analysis
4. Test Dan with plain text (no URL) - verify he still works as a conversational advisor
5. Test Dan with a realestate.com.au URL

**Step 4: Commit any fixes, then final commit**

```bash
git add -A
git commit -m "feat: deal analysis agents - Dan and Phil ready for testing"
```
