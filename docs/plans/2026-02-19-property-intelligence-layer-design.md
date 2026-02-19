# Property Intelligence Layer - Design Document

**Date:** 2026-02-19
**Status:** Approved
**Author:** Reid + Claude

## Problem

Deal Analyser Dan and FISO Phil currently have listing data (beds, baths, price, land size) but lack suburb context, zoning, school quality, neighbourhood sentiment, and vacancy rates. This limits the depth of deal analysis - an investor needs to know whether a suburb is growing, what the zoning allows, and whether the numbers stack up in context.

## Solution

An on-demand property intelligence layer that enriches property lookups with suburb, zoning, demographic, school, and sentiment data. Triggered per-request when a user asks about a property. Results cached in Supabase so repeated lookups for the same suburb are instant.

**Key principle: on-demand, not batch.** We never scrape in bulk. Every Apify call is triggered by a user asking about a specific property. Cache prevents redundant calls.

## Data Sources

### Tier 1 - Apify On-Demand Scrapers

| Source | Data | Actor | Cost |
|--------|------|-------|------|
| domain.com.au suburb profiles | Median prices, rental yields, demographics, growth, auction clearance | Marketplace actor or custom (`__NEXT_DATA__` JSON) | ~$1/1,000 lookups |
| homely.com.au | Resident reviews, liveability ratings, neighbourhood sentiment | Custom actor (build) | Compute-based |
| SQM Research | Vacancy rates by postcode | Custom actor (build) | Compute-based |

**Apify plan:** Free tier ($5/mo) is sufficient for typical usage. Upgrade to Starter ($49/mo) if volume grows.

### Tier 2 - Free Government APIs (no Apify needed)

| Source | Data | Auth | Format |
|--------|------|------|--------|
| ABS Data API | SEIFA indices, median income, population, dwelling counts, household composition | None | SDMX REST / JSON |
| Vicmap Planning REST API (VIC) | Zone codes, overlays, building height limits, lot sizes | None | Esri REST |
| NSW Planning Portal API (NSW) | Zoning, DAs, planning controls | API key (free) | REST |
| QLD Globe spatial services (QLD) | Zoning, overlays | None | WFS |
| PlanSA (SA) | Zoning, overlays | TBC | WFS |
| Landgate SLIP (WA) | Zoning, overlays | API key (free) | WFS |

### Tier 3 - Cached Data (periodic refresh)

| Source | Data | Refresh |
|--------|------|---------|
| myschool.edu.au | School ICSEA scores, NAPLAN, enrolments | Scraped on-demand, cached 90 days |
| NSW BOCSAR | Crime stats by suburb | Quarterly CSV download |
| VIC Crime Statistics Agency | Crime stats by LGA | Quarterly Excel download |

### What we're NOT integrating (YAGNI)

- CoreLogic / PropTrack (enterprise pricing, TOS issues)
- realestate.com.au scraping (litigious, aggressive anti-bot)
- Historical price trends (need CoreLogic)
- Automated valuations / comparable sales
- Transport proximity scoring
- DA history lookup

## Data Model

### Extended interfaces (in listing-types.ts)

```typescript
interface ZoningData {
  zoneCode: string;              // "GRZ1", "NRZ1", "C1Z"
  zoneDescription: string;       // "General Residential Zone - Schedule 1"
  overlays: string[];            // ["HO123", "SLO2", "DDO8"]
  overlayDescriptions: string[];
  maxBuildingHeight: string | null;
  minLotSize: string | null;
  state: string;
  source: string;
  fetchedAt: string;
}

interface SchoolData {
  name: string;
  type: 'primary' | 'secondary' | 'combined';
  sector: 'government' | 'catholic' | 'independent';
  icsea: number | null;
  enrolments: number | null;
  distanceKm: number | null;
}

interface NeighbourhoodSentiment {
  overallRating: number | null;  // out of 5
  reviewCount: number;
  topPositives: string[];
  topNegatives: string[];
  source: 'homely';
}

interface PropertyIntelligence {
  listing: ListingData;
  suburb: SuburbContext;          // existing interface, now populated
  zoning: ZoningData | null;
  nearbySchools: SchoolData[];
  sentiment: NeighbourhoodSentiment | null;
  crimeRating: 'low' | 'medium' | 'high' | null;
  fetchedAt: string;
  errors: string[];              // partial failures don't block response
}
```

## Module Structure

```
packages/pipeline/src/pipeline/
  intelligence/                     NEW
    apify-client.ts                 Shared Apify API client (run actor, poll, fetch dataset)
    suburb-scraper.ts               Apify: domain.com.au suburb profiles
    zoning-lookup.ts                State planning API router (VIC/NSW/QLD/SA/WA)
    abs-demographics.ts             ABS Data API client (SDMX REST)
    school-lookup.ts                myschool.edu.au scraper/cache
    sentiment-scraper.ts            Apify: homely.com.au suburb reviews
    vacancy-scraper.ts              Apify: SQM Research vacancy rates
    crime-data.ts                   Cached crime stats (BOCSAR/VIC CSA)
    cache.ts                        Supabase-backed cache layer with TTLs
    orchestrator.ts                 Combines all sources into PropertyIntelligence
    index.ts                        Barrel export
```

## Integration Flow

```
User message: "What do you think about 42 Smith St, Kew VIC 3101?"
                    |
                    v
        Chat Route (route.ts)
                    |
    +---------------+---------------+
    |                               |
    v                               v
lookupListingByAddress()    enrichPropertyIntelligence()
(existing - Domain/REA)     (NEW - runs in parallel)
    |                               |
    v                       +-------+-------+-------+-------+-------+
ListingData                 |       |       |       |       |       |
                            v       v       v       v       v       v
                        Suburb  Zoning   ABS    Schools Sentiment Vacancy
                        (Apify) (State  (API)  (cache) (Apify)   (Apify)
                                 API)
                            |       |       |       |       |       |
                            +-------+-------+-------+-------+-------+
                                            |
                                            v
                                  PropertyIntelligence
                                            |
                                            v
                              buildPropertyIntelligenceBlock()
                                            |
                                            v
                              Injected into agent system prompt
```

Each data source module follows this pattern:
1. Check Supabase cache for `{source}:{suburb}:{state}`
2. If cache hit and not expired, return cached data
3. If cache miss, call external API/Apify
4. Store result in cache with TTL
5. Return data (or null on failure - never throw)

## Caching

### Supabase table: `property_intelligence_cache`

| Column | Type | Purpose |
|--------|------|---------|
| cache_key | text PK | `{source}:{suburb}:{state}` or `{source}:{address}` |
| data | jsonb | Cached response |
| fetched_at | timestamptz | When fetched |
| expires_at | timestamptz | TTL-based expiry |

### TTLs

| Data type | TTL | Rationale |
|-----------|-----|-----------|
| Suburb profiles | 7 days | Market data shifts weekly |
| Zoning | 30 days | Rarely changes |
| ABS demographics | 30 days | Census data, slow-moving |
| Schools | 90 days | Annual data |
| Sentiment | 14 days | Reviews trickle in |
| Vacancy rates | 7 days | Market-sensitive |
| Crime stats | 90 days | Quarterly updates |

## Prompt Injection

New `buildPropertyIntelligenceBlock(intel: PropertyIntelligence)` function that formats the data as structured, readable sections (not raw JSON). Example output:

```
-- SUBURB INTELLIGENCE: KEW, VIC 3101 ---------
Median house price: $2.15M | Units: $785K | Weekly rent: $620
Gross rental yield: 2.8% | Vacancy rate: 1.2%
Population: 26,400 | Median age: 38 | Median income: $92K
Owner-occupier: 62% | Family households: 58%
SEIFA advantage index: 1078 (top decile)
5yr population growth: +4.2%

Zoning: GRZ1 (General Residential Zone - Schedule 1)
Overlays: HO (Heritage), DDO8 (Design & Development)
Max height: 11m (3 storeys) | Min lot: 500sqm

Nearby schools: Kew Primary (ICSEA 1120), Kew High (ICSEA 1085)
Neighbourhood: 4.2/5 (128 reviews) - "Family friendly, leafy streets, great cafes"
Crime: Low
Sources: Domain, ABS Census 2021, Vicmap Planning, Homely, BOCSAR
---------------------------------------------------
```

## Environment Variables

```
# Apify (NEW)
APIFY_API_TOKEN=<your apify token>

# State planning APIs (as needed)
NSW_PLANNING_API_KEY=<free key from planningportal.nsw.gov.au>
```

## Cost Estimate

| Item | Monthly cost |
|------|-------------|
| Apify Free tier | $0-5 |
| ABS / State planning APIs | Free |
| Supabase (existing) | Already paid |
| **Total** | **~$5/mo to start** |

Upgrade to Apify Starter ($49/mo) if you're doing 500+ unique suburb lookups per month.

## Implementation Priority

1. Cache layer + orchestrator skeleton (foundation)
2. Suburb profile scraper via Apify (highest value - fills SuburbContext)
3. ABS demographics API (free, easy, high value)
4. Zoning lookup - VIC first via Vicmap (you're in VIC)
5. Vacancy rate scraper via Apify (feeds directly into cashflow analysis)
6. Prompt injection + chat route integration
7. Zoning lookup - NSW, QLD, SA, WA
8. Sentiment scraper (Homely)
9. School lookup
10. Crime data caching
