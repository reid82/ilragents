# OnTheHouse.com.au Fallback + Bright Data Scraping Browser

**Date:** 2026-02-22
**Status:** Design

## Problem

The current listing lookup pipeline relies on SerpAPI to find listing URLs on Domain/REA, then uses Cheerio (direct HTTP) or Apify actors to scrape page data. Two issues:

1. **No OnTheHouse.com.au support.** OTH (powered by CoreLogic) has property data on 12.5M+ Australian properties including sold history, value estimates, and comparables - but it's not in the lookup chain.
2. **Apify is slow and expensive.** Detail enrichment via Apify actors costs ~$0.30/page and takes up to 5 minutes due to cold starts, container provisioning, and residential proxy setup.

## Solution

1. Add `onthehouse.com.au` as a third SerpAPI site target in the lookup chain
2. Replace Apify + Cheerio scraping with Bright Data Scraping Browser (CDP-based headless browser with built-in anti-bot bypass)

## Lookup Chain (New)

```
SerpAPI (site:domain.com.au)     -> Bright Data scrape -> snippet fallback
  miss |
SerpAPI (site:realestate.com.au) -> Bright Data scrape -> snippet fallback
  miss |
SerpAPI (site:onthehouse.com.au) -> Bright Data scrape -> snippet fallback
  miss |
Domain API (if configured)
  miss |
not-found
```

Each step: SerpAPI finds the URL (fast, ~1-2s), Bright Data renders the JS page and extracts data (~5-15s), snippet fallback if scrape fails (instant).

## Architecture

### New: `bright-data-scraper.ts`

Replaces `apify-client.ts` as the scraping engine. Connects via CDP (Chrome DevTools Protocol) to Bright Data's Scraping Browser.

```typescript
interface BrightDataScraper {
  // Connect to Bright Data Scraping Browser via CDP
  scrapePage(url: string, extractor: PageExtractor): Promise<Record<string, unknown>>;
}

// Each source has its own extraction logic
type PageExtractor = (page: Page) => Promise<Record<string, unknown>>;
```

**Connection:** `wss://brd-customer-{ID}-zone-scraping_browser:{PASSWORD}@brd.superproxy.io:9222`

**Env vars (new):**
- `BRIGHT_DATA_BROWSER_WS` - WebSocket endpoint (includes auth)

**Env vars (deprecated but kept):**
- `APIFY_API_TOKEN` - No longer used for scraping, can be removed later

### New: Source-specific extractors

Each site gets a dedicated extraction function that runs inside the browser page context:

- `extractDomainData(page)` - Parse `__NEXT_DATA__` or rendered DOM from domain.com.au
- `extractReaData(page)` - Parse `ArgonautExchange` or rendered DOM from realestate.com.au
- `extractOnthehouseData(page)` - Parse `REDUX_DATA` or rendered DOM from onthehouse.com.au

These replace the logic currently split across `listing-scraper.ts` (Cheerio) and `apify-listing-detail.ts` (Apify actors).

### Modified: `serper-lookup.ts`

- Add `onthehouse.com.au` as third site in search order
- Add `isOnthehouseUrl()` validator
- `SerperLookupResult.source` becomes `'domain' | 'rea' | 'onthehouse'`

### Modified: `listing-types.ts`

- `ListingData.source` widens to `'domain' | 'rea' | 'onthehouse'`
- `ListingData.enrichmentSource` adds `'bright-data'`
- `detectListingUrl()` detects OTH URLs

### Modified: `listing-lookup.ts`

- `LookupResult.source` adds `'serper-onthehouse'`
- Scraping calls route through `bright-data-scraper.ts` instead of Cheerio/Apify
- Existing Cheerio scrape replaced with Bright Data scrape
- Apify enrichment step removed (Bright Data scrape gets full page data in one pass)
- If `BRIGHT_DATA_BROWSER_WS` not configured, falls back to existing Cheerio/Apify path (backwards compatible)

### Modified: `apify-listing-detail.ts`

- `enrichListingDetail()` updated to use Bright Data when available, Apify as fallback
- Merge functions (`mergeDomainDetail`, `mergeReaDetail`) stay the same - they work with raw extracted data regardless of source
- New `mergeOnthehouseDetail()` for OTH-specific data mapping

## OTH Data Mapping

OnTheHouse (CoreLogic) provides:

| OTH Field | Maps to ListingData |
|-----------|-------------------|
| Property type, beds, baths, car | `propertyType`, `bedrooms`, `bathrooms`, `parking` |
| Land size | `landSize` |
| Estimated value | `priceGuide` |
| Sale history | `propertyHistory[]` |
| Comparable sales | `nearbySoldComparables[]` |
| Council rates | `councilRates` |
| Body corp fees | `bodyCorpFees` |
| Property photos | `images[]` |

Note: OTH may not have `listingType`, `auctionDate`, `daysOnMarket`, `agentName`, `inspectionTimes` since it's a property data site, not an active listing portal. These fields stay null.

## Cost Comparison

| Metric | Apify (current) | Bright Data (proposed) |
|--------|-----------------|----------------------|
| Per scrape | ~$0.30 | ~$0.02-0.05 |
| Latency | 30s - 5min | 5-15s |
| Concurrency | 1 (polling) | 10+ (CDP) |
| Anti-bot | Actor-dependent | Built-in (CAPTCHA, fingerprint, retry) |
| New sites | New actor required | Same code, new extractor function |

## Backwards Compatibility

- If `BRIGHT_DATA_BROWSER_WS` is not set, falls back to existing Cheerio + Apify path
- All existing env vars still work
- Existing tests pass without modification (mocked at module level)
- Merge functions are reused - only the scraping transport changes

## Files Changed

| File | Change |
|------|--------|
| `intelligence/bright-data-scraper.ts` | **NEW** - CDP client + page extractors |
| `intelligence/serper-lookup.ts` | Add OTH site search + URL validator |
| `extractors/listing-lookup.ts` | Route scraping through Bright Data, add OTH source |
| `extractors/listing-types.ts` | Widen source/enrichment types, add OTH URL detection |
| `intelligence/apify-listing-detail.ts` | Add Bright Data path + OTH merge function |
| `extractors/listing-lookup.test.ts` | Add OTH fallback tests, Bright Data mock tests |
| `intelligence/bright-data-scraper.test.ts` | **NEW** - Unit tests for CDP scraper |
| `packages/pipeline/.env.example` | Add `BRIGHT_DATA_BROWSER_WS` |

## Test Plan

1. Unit: `isOnthehouseUrl()` URL validation (valid/invalid patterns)
2. Unit: `extractOnthehouseData()` parser with sample DOM/Redux data
3. Unit: `mergeOnthehouseDetail()` data mapping
4. Unit: `BrightDataScraper` with mocked CDP connection
5. Integration: Full lookup chain - Domain miss -> REA miss -> OTH hit
6. Integration: Bright Data unavailable -> falls back to Cheerio/Apify
7. Integration: All sources miss -> Domain API fallback -> not-found

## Out of Scope

- Government sold-price data (bulk ingestion, different use case)
- Removing Apify dependency entirely (kept as fallback)
- Suburb enrichment from OTH suburb pages
- Bright Data cost monitoring/alerting
