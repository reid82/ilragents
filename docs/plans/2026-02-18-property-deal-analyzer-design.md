# Property Deal Analyzer Agent — Design Plan

> **Goal:** A new agent ("Deal Analyzer") that takes an Australian property address or listing URL, scrapes and aggregates all available data, and applies ILR methodology to assess whether it's a good deal — personalized to the user's financial position, goals, and strategy phase.

---

## 1. What This Agent Does (User-Facing)

The user provides **one or both** of:
- A property **address** (e.g. "14 Smith St, Parramatta NSW 2150")
- A **listing URL** from Domain.com.au or realestate.com.au

The agent then:
1. **Scrapes the listing** (if URL provided) for asking price, property features, photos, land size, agent info, etc.
2. **Enriches with external data** — suburb stats, comparable sales, rental estimates, zoning, flood risk, council rates, demographics
3. **Runs ILR deal analysis** — applies the user's financial position + ILR strategy framework to assess the deal
4. **Returns a structured Deal Report** — numbers, strategy fit, risks, and a clear recommendation

---

## 2. Deal Analysis Framework (ILR-Aligned)

The analysis must map directly to ILR concepts. This isn't generic "is property good/bad" — it's "does this deal advance THIS client's strategy?"

### 2.1 Data Collection Phase

For every property analyzed, gather:

| Category | Data Points | Source |
|----------|-------------|--------|
| **Listing Data** | Asking price, property type, bedrooms/bathrooms/parking, land size, building size, listed date, agent, description, photos | Listing scrape (Domain/REA) |
| **Comparable Sales** | Recent sales within 500m-2km, same property type, last 6-12 months | Domain API / CoreLogic |
| **Rental Data** | Current median rent for equivalent property, vacancy rate, rental yield for suburb | Domain API / SQM Research |
| **Suburb Profile** | Median house/unit price, 1/3/5/10yr growth, population, demographics, income levels | Domain API / ABS |
| **Zoning & Planning** | Current zoning, permitted uses, minimum lot size, FSR, height limits, overlays | State planning portals (NSW/VIC/QLD free APIs) |
| **Risk Factors** | Flood zone, bushfire zone, heritage overlay, contaminated land, easements | State government open data |
| **Council Rates** | Approximate annual council rates for the area | Council websites |
| **Infrastructure** | Proximity to train/bus, schools, hospitals, shopping centres | Google Maps / ABS |

### 2.2 ILR Analysis Phase

Once data is collected, run five distinct analyses:

#### A. Cashflow Analysis (Cash Cow Assessment)
```
Weekly Rent (estimated or actual)
× 52 = Gross Annual Rent
− Vacancy allowance (use suburb vacancy rate, min 5%)
− Property management (typically 7-8% + GST)
− Insurance (estimate based on property type)
− Council rates (from data)
− Water rates (estimate)
− Maintenance allowance (5-10% of rent)
− Strata/body corp (if applicable)
= Net Annual Income

Mortgage repayments (based on user's borrowing rate + deposit capacity)
= Annual Cashflow (positive or negative)
= Weekly Cashflow
```

**ILR Verdict:** Is this a Cash Cow? Only if it's cashflow positive or very close to neutral after all real costs. Frame in terms of "doors" — is there potential for multiple income streams?

#### B. Deal Analysis / FISO (Chunk Deal Assessment)
```
Purchase Price + Stamp Duty + Legal + Inspections = Total Acquisition Cost
+ Renovation/Improvement Budget (if value-add play)
= Total Investment

Post-Improvement Estimated Value (based on comparable sales of improved properties)
− Total Investment
= Manufactured Equity (the "Chunk")

Chunk as % of Total Investment = Return on Chunk Deal
```

**ILR Verdict:** Is this a viable Chunk Deal? What's the manufactured equity opportunity? Consider: cosmetic reno, structural reno, granny flat addition, subdivision potential, dual-occ conversion.

#### C. Strategy Stack Assessment
Evaluate which ILR strategies could be **stacked** on this property:

| Strategy | Viable? | Why/Why Not |
|----------|---------|-------------|
| Cosmetic reno | ? | Based on property age, condition from listing |
| Structural reno | ? | Based on property age, layout, building type |
| Granny flat / DPU | ? | Based on land size, zoning, council rules |
| Subdivision | ? | Based on land size, zoning, minimum lot size, dual frontage |
| Dual-occ / duplex | ? | Based on zoning, land size, council policy |
| Development (knockdown rebuild) | ? | Based on land value ratio, zoning, FSR |
| Multiple doors (rooms/units) | ? | Based on layout, zoning, property type |

**ILR Verdict:** Can strategies be stacked? E.g., "Buy → reno → subdivide rear → add granny flat to front → sell rear lot (chunk) → hold front + granny flat (income)." The more strategies that stack, the stronger the deal.

#### D. Sensitivity Analysis (Stress Test)
Run the cashflow numbers under stressed conditions:

| Scenario | Parameters |
|----------|-----------|
| Base case | Current rates, estimated rent, 2-week vacancy |
| Rate rise +1% | Interest rate +1% above current |
| Rate rise +2% | Interest rate +2% above current |
| Rent drop −10% | Rental income reduced 10% |
| Extended vacancy | 6-week vacancy instead of 2 |
| Combined stress | Rate +1.5% AND rent −10% |

**ILR Verdict:** Does the deal survive stress? If it breaks under realistic conditions, it's not solid. Flag the break-even interest rate and minimum rent required.

#### E. Position Fit Assessment (Personalized)
Using the client's financial profile:

- **Can they afford it?** Purchase price vs. borrowing capacity, deposit required vs. cash available, stamp duty impact
- **Should they?** Does it match their strategy phase (Phase 1/2/3)? If they need chunks, is this a chunk deal? If they have capacity for income deals, does this deliver cashflow?
- **What gets tied up?** Serviceability impact — how much borrowing capacity does this consume? Does it leave room for the next deal?
- **Structure recommendation:** Should this be held personally, in trust, in company, in SMSF? (High-level only — refer to specialists for implementation)

### 2.3 Output: The Deal Report

Structured response with clear sections:

```
## Property Summary
[Address, type, land size, features, asking price]

## Market Context
[Suburb median, growth trends, how this property compares, comparable sales]

## Cashflow Analysis
[Numbers table — gross rent through to weekly cashflow]
[Cash Cow rating: Strong / Marginal / Negative]

## Deal Analysis (FISO)
[Chunk deal potential — acquisition cost, improvement cost, estimated end value, manufactured equity]
[Chunk rating: Strong / Moderate / Minimal / None]

## Strategy Stack
[Which strategies are viable and how they combine]
[Stack rating: Multi-stack / Single-strategy / Hold-only]

## Stress Test
[Table of scenarios and outcomes]
[Resilience rating: Bulletproof / Solid / Fragile / Breaks]

## Position Fit
[Personalized assessment against their numbers and goals]
[Fit rating: Strong fit / Conditional fit / Poor fit / Beyond current capacity]

## Overall Assessment
[2-3 paragraph summary in ILR language]
[Clear recommendation: Pursue / Investigate further / Pass]
[Key risks and next steps]
```

---

## 3. Technical Architecture

### 3.1 Agent Definition

New agent added to `agents.ts`:

```typescript
{
  id: "deal-analyzer",
  name: "Deal Analyzer",
  domain: "Property Deal Analysis",
  description:
    "Analyses specific properties against ILR strategy. Give it an address or listing URL and it runs the numbers.",
  color: "#F59E0B",  // amber/gold
  avatarUrl: "https://api.dicebear.com/9.x/adventurer/svg?seed=DealAnalyzer&backgroundColor=F59E0B&skinColor=f2d3b1",
  ragAgents: ["Finder Fred", "ILR Methodology"],
  contextLimit: 20,
}
```

RAG sources: Finder Fred (property sourcing knowledge) + ILR Methodology (strategy framework). Could also pull from Splitter Steve (subdivision), Equity Eddie (equity), Yield Yates (yield) depending on what strategies are viable.

### 3.2 New API Route: `/api/deal/analyze`

This is a **multi-step orchestration** endpoint, distinct from the normal chat flow. It:

1. Accepts: `{ address?: string, listingUrl?: string, userId: string }`
2. Runs the data collection pipeline (scraping + API calls)
3. Assembles all data into a structured context object
4. Sends to LLM with a specialized system prompt + the collected data + user's financial profile
5. Returns the structured Deal Report

**Why a separate endpoint?** The normal chat endpoint does RAG search + single LLM call. The deal analyzer needs to do web scraping, multiple API calls, data aggregation, and then a much larger LLM call with all that context. It's a different flow.

### 3.3 Data Collection Services

New directory: `packages/web/src/lib/deal-analyzer/` (or `packages/pipeline/src/pipeline/deal-analyzer/`)

```
deal-analyzer/
├── index.ts              # Main orchestrator
├── types.ts              # PropertyData, DealReport, etc.
├── scrapers/
│   ├── listing-scraper.ts    # Scrape Domain/REA listing pages
│   └── suburb-scraper.ts     # Scrape suburb profile data
├── enrichment/
│   ├── domain-api.ts         # Domain API client (free tier)
│   ├── planning-data.ts      # State planning portal queries
│   ├── flood-risk.ts         # Flood/bushfire data lookups
│   ├── demographics.ts       # ABS data integration
│   └── rental-data.ts        # SQM/Domain rental data
├── analysis/
│   ├── cashflow.ts           # Cashflow calculation engine
│   ├── fiso.ts               # Deal analysis (chunk assessment)
│   ├── strategy-stack.ts     # Strategy viability assessment
│   ├── sensitivity.ts        # Stress test scenarios
│   └── position-fit.ts       # Client-specific fit analysis
└── prompts/
    └── deal-system-prompt.ts # Specialized system prompt
```

### 3.4 Data Source Priority (What to Build First)

Not all data sources are equal in terms of value vs. implementation effort. Phased approach:

**Phase 1 — MVP (High value, achievable now)**
1. **Listing scraper** — Cheerio-based (you already have the web scraper infrastructure). Parse `__NEXT_DATA__` from Domain.com.au listings. Extract: price, beds/bath/car, land size, property type, description, images, agent.
2. **Domain API (free tier)** — Suburb profile, sales history, comparable sales. OAuth2 setup required but free.
3. **Cashflow calculator** — Pure math, no external dependencies. Uses estimated rent from Domain API + user's borrowing rate.
4. **FISO calculator** — Pure math. Uses comparable sales data + renovation cost estimates.
5. **LLM analysis** — Feed all collected data + client profile into Claude with a specialized deal analysis system prompt. Let the LLM do the strategy stacking assessment, sensitivity narrative, and position fit narrative.

**Phase 2 — Enhanced Data**
6. **Zoning/planning data** — NSW Planning Portal API (free, well-documented). Start with NSW, expand to VIC/QLD.
7. **Flood risk data** — State flood mapping portals (free GIS data).
8. **ABS demographics** — Free API, adds suburb context (income levels, population growth, age distribution).
9. **Sensitivity calculator** — Automated stress test table generation (pure math).

**Phase 3 — Premium Data (if budget allows)**
10. **CoreLogic/Cotality API** — Best comparable sales data, AVM, construction data. Requires commercial agreement.
11. **Archistar API** — Development feasibility, planning rules, risk data. Paid.
12. **realestate.com.au scraping** — Harder to scrape, but wider listing coverage. May need proxy service.

### 3.5 UI Integration

Two ways to interact with the deal analyzer:

**Option A: Dedicated Input Mode (Recommended for MVP)**
- New component: `DealAnalyzerPanel.tsx`
- Input field that accepts an address OR listing URL (auto-detect which it is)
- "Analyze" button triggers the `/api/deal/analyze` endpoint
- Shows a loading state with progress indicators ("Scraping listing...", "Fetching suburb data...", "Running analysis...")
- Renders the Deal Report in a structured, readable format
- Below the report, opens a chat with the Deal Analyzer agent for follow-up questions (with the deal data injected as context)

**Option B: Chat-First with Tool Use**
- User chats with Deal Analyzer agent normally
- When they paste a URL or address, the agent detects it and triggers the analysis pipeline as a "tool call"
- Results are woven into the chat response
- More natural but harder to implement cleanly (requires function calling / tool use pattern)

**Recommendation:** Start with Option A for MVP — it's cleaner and lets us get the data pipeline right. Add Option B later as the chat-integrated version.

### 3.6 System Prompt (Deal Analyzer Specific)

The deal analyzer gets a specialized system prompt that differs from the standard agent prompts. Instead of answering general questions with RAG context, it receives:

1. The ILR methodology framework (same core philosophy section)
2. The collected property data (structured JSON/markdown)
3. The calculated numbers (cashflow, FISO, sensitivity tables)
4. The client's financial profile
5. Instructions to produce the structured Deal Report format

The LLM's job is to **interpret and synthesize**, not to calculate. The calculations are done in code. The LLM provides:
- Market context narrative
- Strategy stacking assessment (requires judgment about what's viable)
- Position fit narrative (requires understanding ILR phases)
- Overall recommendation with reasoning
- Risk identification

---

## 4. Key Design Decisions to Make

### 4.1 Where does the calculation logic live?

**Option A: Server-side TypeScript (Recommended)**
All calculations (cashflow, FISO, sensitivity) run in TypeScript before the LLM call. The LLM receives pre-calculated numbers and provides interpretation.

**Option B: LLM does everything**
Send raw data to the LLM and let it calculate. Simpler to implement but less reliable — LLMs make arithmetic errors.

**Recommendation:** Option A. The LLM is the strategist, not the calculator. Calculate in code, interpret with AI.

### 4.2 How to handle missing data?

Not every data source will return results for every property. The system should:
- Mark missing data explicitly ("Rental estimate: Not available — no comparable rental data found")
- Adjust confidence level of the analysis based on data completeness
- Still produce a report with whatever data is available, with caveats
- Suggest what additional information the user could provide to improve the analysis

### 4.3 How to handle listing URL vs. address-only?

| Input | Approach |
|-------|----------|
| Domain listing URL | Scrape listing → extract address → enrich with API data → full analysis |
| REA listing URL | Scrape listing → extract address → enrich with API data → full analysis |
| Address only | Skip listing scrape → use Domain API to find recent/current listings → enrich → analysis (less listing detail, more market-level) |
| Address + asking price | Address-only flow but with user-supplied price for calculations |

### 4.4 Rate limiting and caching

- Cache scraped listing data for 24 hours (listings don't change that fast)
- Cache suburb/demographic data for 7 days
- Cache planning/zoning data for 30 days
- Rate limit: max 1 analysis per user per minute, 10 per hour
- Store analysis results in Supabase for the user to revisit (new `deal_analyses` table)

---

## 5. Database Schema

New table for storing deal analyses:

```sql
CREATE TABLE deal_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  address TEXT NOT NULL,
  listing_url TEXT,
  property_data JSONB NOT NULL,      -- All collected property data
  analysis_result JSONB NOT NULL,     -- Calculated numbers
  llm_report TEXT NOT NULL,           -- The generated Deal Report
  financial_snapshot JSONB,           -- User's financial position at time of analysis
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deal_analyses_user ON deal_analyses(user_id);
CREATE INDEX idx_deal_analyses_address ON deal_analyses(address);
```

---

## 6. MVP Scope Summary

For the first working version:

1. **Listing scraper** for Domain.com.au (Cheerio, `__NEXT_DATA__` parsing)
2. **Domain API integration** (free tier — suburb profile, comparable sales, rental data)
3. **Cashflow calculator** (TypeScript, pure math)
4. **FISO calculator** (TypeScript, pure math)
5. **Deal Analyzer system prompt** with ILR methodology
6. **API endpoint** `/api/deal/analyze` — orchestrates scraping → enrichment → calculation → LLM → report
7. **Basic UI** — input field for URL/address, loading states, rendered report
8. **Agent definition** — added to existing agent roster
9. **Client profile integration** — uses existing financial position data for personalized analysis

**Not in MVP:** Planning/zoning data, flood risk, ABS demographics, CoreLogic integration, realestate.com.au scraping, saved analyses, chat-integrated tool use mode.

---

## 7. Risks and Considerations

| Risk | Mitigation |
|------|-----------|
| Domain.com.au scraping may break if they change HTML structure | Use `__NEXT_DATA__` JSON approach (more stable than HTML parsing); Domain API as primary, scraping as fallback |
| Domain API free tier may have tight rate limits | Cache aggressively; queue analysis requests |
| Property data may be incomplete for some areas | Graceful degradation — produce report with caveats on missing data |
| LLM may hallucinate property values or calculations | All numbers calculated in code, not by LLM; LLM only interprets |
| Legal risk of scraping | Use official APIs where available; respect robots.txt; don't store/redistribute scraped data beyond user's own analysis |
| User expectations — they may expect 100% accuracy | Clear disclaimers: "This analysis is indicative. All figures are estimates. Verify with professionals before making decisions." |
| Stamp duty varies by state | Build state-specific stamp duty calculators (NSW, VIC, QLD initially) |
| Renovation cost estimates are inherently imprecise | Use ranges (low/mid/high) rather than single figures; let user override |

---

## 8. Future Enhancements (Post-MVP)

- **Batch analysis** — analyze multiple properties and compare side-by-side
- **Saved deals** — persist analyses, mark favorites, add notes
- **Portfolio impact** — show how buying this property changes the overall portfolio cashflow and equity position
- **Development feasibility** — deeper subdivision/development analysis using Archistar data
- **Market timing indicators** — suburb growth trajectory, days on market trends, supply/demand balance
- **Comparable property suggestions** — "If you like this, also look at..."
- **PDF export** — downloadable Deal Report for sharing with broker/accountant
- **Chat integration** — ask follow-up questions about an analyzed deal ("What if I only put 10% down?" "What if rent was $50/week higher?")
- **Watchlist** — save searches and get notified when new listings match criteria
