# Deal Analysis Agents - Design Document

**Date:** 2026-02-18
**Status:** Approved
**Author:** Reid Bates + Claude

## Problem

ILR Agents has 4 advisory agent personas covering strategy, sourcing, portfolio management, and legal/tax. What's missing is the ability for a member to paste a property listing URL or address and get an ILR-methodology deal assessment. Members currently do this manually or in coaching calls - there's no automated tool that scrapes listing data, pulls in the user's financial position, and applies ILR frameworks.

## Solution

Two new agents sharing common infrastructure:

1. **Deal Analyser Dan** - Conversational deal analyst. Scrapes listings, applies ILR methodology via RAG, walks the user through an assessment interactively.
2. **FISO Phil** - Structured calculator. Hard-coded TypeScript calculation modules implementing ILR formulas (FISO, cashflow, sensitivity, capacity). Produces a repeatable report card.

Dan ships first. Both share a listing scraper and suburb enrichment layer.

## Architecture

### Shared Infrastructure

**Listing Scraper** (`packages/pipeline/src/pipeline/extractors/listing-scraper.ts`)
- Accepts domain.com.au URLs (parse `__NEXT_DATA__` JSON) and realestate.com.au URLs (parse `ArgonautExchange` JSON)
- Address-to-listing search via constructed search URLs
- Returns standardised `ListingData` type regardless of source
- Built on existing Cheerio infrastructure from `web-scraper.ts`

**Suburb Enrichment** (`packages/pipeline/src/pipeline/extractors/suburb-enrichment.ts`)
- Takes suburb + state + postcode from listing
- Phase 1: ABS Census data (free API), domain.com.au embedded market data
- Phase 2: Proptech Data API (vacancy rates, rental yields, risk overlays)
- Returns standardised `SuburbContext` type

**Listing API Route** (`packages/web/src/app/api/listing/scrape/route.ts`)
- Server-side endpoint called by chat UI when URL detected in message
- Scrapes listing + enriches suburb + caches in Supabase

### Deal Analyser Dan

- New agent in `AGENTS` array and `AGENT_ALIASES` (RAG sources: Finder Fred, Foundation Frank, Yield Yates, ILR Methodology)
- Custom system prompt with deal analysis instructions
- URL detection in chat stream route triggers listing scrape
- Scraped data injected as context block (like financial profile injection)
- Conversational flow: detect listing -> ask strategy intent -> apply FISO/cashflow/sensitivity -> assess capacity -> flag risks -> referrals
- `ListingCard` component renders property summary above chat response

### FISO Phil

- New agent with hard-coded calculation modules in `packages/pipeline/src/pipeline/calculators/`
- **FISO Calculator:** Profit, Cash on Cash Return, % Profit on Development Cost, Per Annum Conversion
- **Cashflow Calculator:** Gross/Net Yield, Net Annual Cashflow, Break-even Rent
- **Sensitivity Engine:** Interest rate stress (+1/2/3%), rent reduction (-10/20%), vacancy (4/8/12 weeks), combined stress
- **Capacity Calculator:** Accessible equity (80% rule), serviceability (income x 6), available funds
- **Strategy Classifier:** Chunk / Income / Stacked recommendation
- `FISOReportCard` component renders structured visual report
- More structured interaction: collect inputs via form-like questions, run calcs, render report, provide narrative

### Jon's Suburb Framework

Ingested into RAG as reference material for Dan to draw on. Not built as standalone scoring system (data source constraints). Future: implement as Phil module when enterprise data sources become available.

## Data Sources

| Source | Data | Cost | Phase |
|--------|------|------|-------|
| domain.com.au scraping | Listing details + embedded suburb market data | Free | 1 |
| realestate.com.au scraping | Listing details | Free | 1 |
| ABS Data API | Census demographics, income, household composition | Free | 1 |
| State planning portals | Zoning, DAs | Free | 2 |
| Proptech Data API | Vacancy rates, rental yields, sales history, risk overlays | Paid | Future |
| SQM Research | Vacancy rates, stock on market | Paid | Future |

## ILR Calculations (from methodology)

| Calculation | Formula |
|-------------|---------|
| Gross Yield | (Annual Rent / Purchase Price) x 100 |
| Net Yield | ((Annual Rent - Expenses) / Total Cost to Acquire) x 100 |
| FISO Profit | End Value - Total Costs |
| Cash on Cash | (Profit / Owner Funds Contributed) x 100 |
| % Profit on Dev Cost | Profit / (Total Costs - Selling Costs - GST) x 100 |
| Per Annum Conversion | Any % / Project Duration in Years |
| Accessible Equity | Total Equity x 80% |
| Serviceability | (Income x 6) - Existing Loans |
| Available Funds | Accessible Equity + Cash - Buffer |

## Build Order

1. Shared infra (listing scraper + types + API route)
2. Deal Analyser Dan (agent registration, system prompt, URL detection, ListingCard)
3. FISO Phil calculators (all calculation modules with tests)
4. FISO Phil agent (registration, system prompt, report card, integration)
5. Suburb enrichment (ABS data integration)
6. Ingest Jon's framework into RAG

## Key Decisions

- **domain.com.au preferred** for scraping (cleaner `__NEXT_DATA__` structure, includes suburb market data)
- **LLM as analysis engine** for Dan (ILR methodology in RAG, Claude applies it conversationally)
- **Hard-coded calcs** for Phil (repeatable, auditable numbers)
- **Dan first** (faster to ship, validates scraping pipeline, immediately useful)
- **Jon's framework as RAG reference** not standalone system (data source constraints)
