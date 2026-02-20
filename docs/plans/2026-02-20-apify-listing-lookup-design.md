# Apify-Powered Listing Lookup

**Date:** 2026-02-20
**Status:** Approved

## Problem

The current listing lookup chain (Domain API -> REA direct scrape -> not-found) fails in practice:

1. **Domain API** requires a paid tier for `listings/residential/_search` - sandbox mode returns 403
2. **Direct REA scraping** gets blocked by anti-bot protections - returns no matching listings
3. The only working path is when a user pastes a full listing URL, which defeats the purpose of address-based lookup

## Decision

Replace Domain API and direct REA scraping entirely with Apify actors. Keep the existing `scrapeListing(url)` function for direct URL scrapes unchanged.

## Architecture

### Flow

```
User message -> extractAddressFromMessage() -> ParsedAddress
  -> searchListingViaApify(address)
    -> Search Domain via Apify actor -> get listing URL
    -> If no Domain result: Search REA via Apify actor -> get listing URL
    -> Scrape listing detail via Apify actor -> return ListingData
  -> If not found on either: return 'not-found'
```

### Apify Actors

| Actor | Purpose | Input |
|-------|---------|-------|
| `fatihtahta/domain-com-au-scraper` | Search Domain for listings matching address | Search URL with suburb/address params |
| `azzouzana/realestate-com-au-search-pages-scraper` | Search REA for listings matching address | Search URL with suburb params |
| `azzouzana/realestate-com-au-properties-pages-scraper` | Scrape full listing detail from REA URL | Property page URL |

### New Files

- `packages/pipeline/src/pipeline/intelligence/apify-listing-lookup.ts` - Apify-powered search + scrape logic

### Modified Files

- `packages/pipeline/src/pipeline/extractors/listing-lookup.ts` - Replace Domain API + REA scrape calls with `searchListingViaApify()`

### Unchanged

- `packages/pipeline/src/pipeline/extractors/listing-scraper.ts` - `scrapeListing(url)` still used for direct URL pastes
- `packages/pipeline/src/pipeline/intelligence/apify-client.ts` - Reused as-is
- `packages/web/src/app/api/chat/stream/route.ts` - No changes needed, already calls `lookupListingByAddress()`

## Data Flow

1. `searchListingViaApify(address)` constructs a Domain search URL from the parsed address
2. Runs Domain scraper actor, filters results for address match
3. If match found, extracts listing data directly from Domain scraper output (it returns full listing details)
4. If no Domain match, constructs REA search URL, runs REA search actor
5. Filters REA search results for address match
6. If match found, runs REA property scraper on the matched URL for full details
7. Maps scraped data to existing `ListingData` interface

## Error Handling

- Each Apify actor call has a 60s timeout (configurable)
- On actor failure, falls through to next source (Domain -> REA -> not-found)
- All errors logged but non-fatal - returns `not-found` status on complete failure
- Existing intelligence enrichment still fires regardless of listing lookup outcome

## Configuration

Actor IDs configurable via env vars (with defaults):
- `APIFY_DOMAIN_SEARCH_ACTOR` (default: `fatihtahta/domain-com-au-scraper`)
- `APIFY_REA_SEARCH_ACTOR` (default: `azzouzana/realestate-com-au-search-pages-scraper`)
- `APIFY_REA_PROPERTY_ACTOR` (default: `azzouzana/realestate-com-au-properties-pages-scraper`)

## What Gets Removed

- `DomainApiClient` usage in listing-lookup.ts (the class stays for now, just unused)
- `searchReaByAddress()` call in listing-lookup.ts (function stays in listing-scraper.ts, just unused)
- Domain API env vars (`DOMAIN_API_CLIENT_ID`, `DOMAIN_API_CLIENT_SECRET`) become optional
