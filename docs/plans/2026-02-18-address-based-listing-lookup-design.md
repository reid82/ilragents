# Address-Based Listing Lookup Design

**Date:** 2026-02-18
**Status:** Approved
**Author:** Reid + Claude

## Problem

Deal Analyser Dan and FISO Phil can only pull listing data when a user pastes a full URL from domain.com.au or realestate.com.au. When a user provides just an address (e.g. "what do you think of 42 Smith St, Richmond VIC 3121"), the agents have no listing data to work with and must ask the user to go find the URL themselves.

## Goal

Let users give Dan/Phil a street address and have the system automatically look up the active listing, pulling the same structured data the agents get from a URL paste. If no listing is found, the agents fall back to asking for manual input.

## Approach

**Domain.com.au official API as primary lookup, REA scrape as fallback.**

- Domain's free-tier API (500 calls/day) provides structured listing and property data
- REA doesn't have a public API, so we scrape their search results as a secondary source
- If neither finds the property, the agent asks the user to provide key numbers manually

## Architecture

### Detection: LLM Address Extraction

Use Claude Haiku to extract structured address components from natural conversational text. This handles all formats - formal addresses, casual mentions, partial addresses - without fragile regex.

**Function:** `extractAddressFromMessage(message: string): Promise<ParsedAddress | null>`

**Returns:**
```typescript
interface ParsedAddress {
  streetNumber: string;
  streetName: string;
  streetType?: string;   // St, Street, Rd, Road, etc.
  unitNumber?: string;
  suburb: string;
  state?: string;        // VIC, NSW, etc.
  postcode?: string;
}
```

**Why LLM over regex:** Users talk naturally to Dan. Addresses could be "that place at 42 Smith in Richmond", "Unit 3/15 Main Rd Heidelberg VIC 3084", or "the house on Smith Street in Richmond". Regex would need dozens of patterns and still miss edge cases.

### Primary Lookup: Domain.com.au API

**New module:** `DomainApiClient` in `packages/pipeline/src/pipeline/extractors/domain-api.ts`

**Auth flow:**
1. POST to `https://auth.domain.com.au/v1/connect/token` with client credentials
2. Cache token (tokens last ~12 hours)
3. Use Bearer token for subsequent API calls

**Env vars:** `DOMAIN_API_CLIENT_ID`, `DOMAIN_API_CLIENT_SECRET`

**OAuth scopes:** `api_listings_read`, `api_properties_read`

**Lookup flow:**
1. `properties/_suggest` with address terms - returns property IDs and basic info
2. `listings/residential/_search` with suburb/state to find active listings in the area
3. Match listing to property by street address
4. `listings/{id}` to get full listing details if needed
5. Map Domain API response to existing `ListingData` interface

**Key endpoints (all GET unless noted, base: `https://api.domain.com.au/v1/`):**

| Endpoint | Method | Purpose |
|---|---|---|
| `properties/_suggest?terms=...&channel=Residential` | GET | Address autocomplete, returns property IDs |
| `listings/residential/_search` | POST | Search active listings by suburb/location |
| `listings/{id}` | GET | Full listing details |
| `addressLocators?searchLevel=Address&streetNumber=...&suburb=...` | GET | Resolve address to Domain IDs |

### Fallback: REA Search Scrape

When Domain API returns no results (not listed on Domain, API down, rate limited).

**New function:** `searchReaByAddress(address: ParsedAddress): Promise<ListingData | null>`

**Added to:** `packages/pipeline/src/pipeline/extractors/listing-scraper.ts`

**Flow:**
1. Build search URL: `https://www.realestate.com.au/buy/in-{suburb},+{state}+{postcode}/list-1`
2. Fetch HTML with existing `fetchHtml()` (browser-like headers)
3. Parse search results for listing cards matching the street address
4. If match found, scrape that listing URL with existing `parseReaListing()`

### Chat Stream Integration

Update `packages/web/src/app/api/chat/stream/route.ts` - the deal analysis block.

**Updated detection priority:**
```
1. detectListingUrl(query)     -> direct scrape (existing, unchanged)
2. extractAddressFromMessage() -> Domain API -> REA fallback -> ListingData or null
3. No URL, no address          -> use base agent prompt (existing, unchanged)
```

**When listing found:** inject via existing `buildListingDataBlock(listing)` - no changes needed downstream.

**When lookup attempted but no listing found:** inject a "lookup failed" context block:
```
-- PROPERTY LOOKUP RESULT -----------------------------------------------
Address searched: 42 Smith St, Richmond VIC 3121
Status: No active listing found on Domain or REA
Action: Ask the user to provide key property details manually
  (purchase price, weekly rent estimate, beds/baths, land size, property type)
-------------------------------------------------------------------------
```

This tells the agent we tried, so it can respond appropriately rather than ignoring the address.

### Data Mapping

Domain API responses get mapped to the existing `ListingData` interface. The existing interface stays unchanged - the new lookup pipeline is just another way to populate it.

```
Domain API field          -> ListingData field
------------------------------------------
address.displayAddress    -> address
address.suburb            -> suburb
address.state             -> state
address.postcode          -> postcode
propertyTypes[0]          -> propertyType
features.bedrooms         -> bedrooms
features.bathrooms        -> bathrooms
features.parkingSpaces    -> parking
landArea                  -> landSize
priceDetails.displayPrice -> price (parsed for priceGuide)
listingType               -> listingType
description               -> description
media[].url               -> images
agents[0].name            -> agentName
agents[0].agency.name     -> agencyName
```

## File Changes

| File | Change |
|---|---|
| `packages/pipeline/src/pipeline/extractors/address-extractor.ts` | **New** - LLM address extraction |
| `packages/pipeline/src/pipeline/extractors/domain-api.ts` | **New** - Domain API client |
| `packages/pipeline/src/pipeline/extractors/listing-scraper.ts` | **Modified** - add `searchReaByAddress()` |
| `packages/pipeline/src/pipeline/extractors/listing-types.ts` | **Modified** - add `ParsedAddress` interface, `detectAddress()` |
| `packages/web/src/app/api/chat/stream/route.ts` | **Modified** - add address lookup to deal analysis block |
| `.env` | **Modified** - add `DOMAIN_API_CLIENT_ID`, `DOMAIN_API_CLIENT_SECRET` |

## Scope

- Both Deal Analyser Dan and FISO Phil get address lookup capability
- Listed properties: automatic lookup via Domain API + REA fallback
- Unlisted properties: agent asks for manual input when lookup fails
- Existing URL detection remains unchanged and takes priority

## Rate Limits & Error Handling

- Domain free tier: 500 calls/day - more than enough for individual deal assessments
- OAuth token cached in memory, refreshed on 401
- All API/scrape failures are non-fatal - agent falls back to asking for manual data
- Timeout: 10 seconds per external call
- No retries - if it fails, fall back

## Future Considerations

- Could cache recent lookups by address to reduce API calls
- Could add suburb enrichment data from Domain's demographics endpoints
- Could extend to rental listings (currently sale-focused)
