// packages/web/src/lib/deal-analyser-prompt.ts

import type { PropertyIntelligence } from '@ilre/pipeline/listing-types';

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
export function buildListingDataBlock(listing: unknown): string {
  return `
── PROPERTY LISTING DATA ─────────────────────────────────
${JSON.stringify(listing, null, 2)}
──────────────────────────────────────────────────────────`;
}

/** Build a context block for when address lookup was attempted but no listing found */
export function buildLookupFailedBlock(addressSearched: string): string {
  const suburb = addressSearched.split(' ').slice(-3).join(' '); // rough suburb+state+postcode
  const domainSearch = `https://www.domain.com.au/sale/?terms=${encodeURIComponent(addressSearched)}`;
  const reaSearch = `https://www.realestate.com.au/buy/in-${suburb.toLowerCase().replace(/\s+/g, '-')}/list-1`;

  return `
── PROPERTY ADDRESS DETECTED ─────────────────────────────────
Address: ${addressSearched}
Listing lookup: No active listing was found automatically.
Search links (share with user if helpful):
  Domain: ${domainSearch}
  REA: ${reaSearch}

IMPORTANT: The user asked about this specific property address.
You know the address. Proceed with your analysis using what you know:
- Acknowledge the specific address they asked about
- Ask them to either paste a listing URL from Domain/REA, OR provide key details manually:
  purchase price (or estimate), expected weekly rent, beds/baths, land size, property type
- If they provide details, run your full deal analysis on those numbers
- You can still discuss the suburb, strategy options, and general assessment while waiting for specifics
──────────────────────────────────────────────────────────`;
}

/**
 * Build a context block of enriched property intelligence for prompt injection.
 * Formats suburb market data, zoning, and neighbourhood sentiment into a
 * human-readable block that is appended to the system prompt.
 */
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
