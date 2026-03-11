/**
 * Roadmap Report - Section prompt templates and RAG query configuration.
 *
 * Each section has:
 *  - ragQueries: targeted queries for vector search, with agent filters
 *  - prompt: the LLM prompt template that receives profile + RAG context
 */

import type { ClientProfile } from './stores/financial-store';

export interface SectionConfig {
  id: number;
  title: string;
  ragQueries: { query: string; agents: string[]; limit: number }[];
  buildPrompt: (profile: ClientProfile, ragContext: string, priorSections?: string) => string;
}

const STYLE_RULES = `
WRITING STYLE RULES:
- Write as a senior ILR property investment strategist addressing this client directly
- Use "you" and the client's first name naturally
- Be specific with numbers: use exact dollar amounts, percentages, and calculations
- Authoritative but warm - you are guiding them, not lecturing
- Reference ILR methodology naturally (chunk deals, income deals, stacked strategies, FISO analysis, manufactured growth) where relevant
- No hedging language ("perhaps", "maybe", "it could be") - be direct
- Australian English, Australian property market context
- No emojis, no em dashes
- Aim for 1000-1500 words for this section
`;

function formatMoney(n: number | undefined): string {
  if (n === undefined || n === null) return 'unknown';
  return '$' + n.toLocaleString('en-AU');
}

function profileSummaryBlock(p: ClientProfile): string {
  const props = p.portfolio.investmentProperties;
  const totalPropertyValue =
    (p.portfolio.homeValue || 0) +
    props.reduce((sum, ip) => sum + (ip.currentValue || 0), 0);
  const totalDebt =
    (p.portfolio.homeMortgage || 0) +
    props.reduce((sum, ip) => sum + (ip.mortgageOwing || 0), 0) +
    (p.financial.existingDebts?.reduce((s, d) => s + (d.balance || 0), 0) || 0);
  const totalEquity = totalPropertyValue - totalDebt;

  return `CLIENT PROFILE:
Name: ${p.personal.firstName}
Age: ${p.personal.age || 'unknown'}
State: ${p.personal.state}
Dependents: ${p.personal.dependents ?? 'unknown'}
Partner investing: ${p.personal.partnerInvesting ? `Yes (income: ${formatMoney(p.personal.partnerIncome)})` : 'No / unknown'}

Employment: ${p.employment.employmentType}, ${formatMoney(p.employment.grossAnnualIncome)} gross annual
Years in role: ${p.employment.yearsInRole || 'unknown'}
HECS: ${p.employment.hasHecsHelp ? `Yes (${formatMoney(p.employment.hecsBalance)})` : 'No'}
Other income: ${p.employment.otherIncomeStreams || 'None'} ${p.employment.otherIncomeAmount ? formatMoney(p.employment.otherIncomeAmount) : ''}

Cash savings: ${formatMoney(p.financial.cashSavings)}
Monthly expenses: ${formatMoney(p.financial.monthlyExpenses)}
Borrowing capacity: ${formatMoney(p.financial.borrowingCapacity)}
Has broker: ${p.financial.hasBroker ?? 'unknown'}
Pre-approval: ${p.financial.hasPreApproval ?? 'unknown'}
Credit card limits: ${formatMoney(p.financial.creditCardLimits)}
Other debts: ${p.financial.existingDebts?.map(d => `${d.type}: ${formatMoney(d.balance)}`).join(', ') || 'None'}

Owns home: ${p.portfolio.ownsHome ? `Yes (value: ${formatMoney(p.portfolio.homeValue)}, mortgage: ${formatMoney(p.portfolio.homeMortgage)})` : 'No'}
Investment properties: ${props.length}
${props.map((ip, i) => `  Property ${i + 1}: ${ip.location || 'unknown location'}, ${ip.type || 'unknown type'}, value: ${formatMoney(ip.currentValue)}, mortgage: ${formatMoney(ip.mortgageOwing)}, rent: ${ip.weeklyRent ? `$${ip.weeklyRent}/wk` : 'unknown'}, structure: ${ip.ownershipStructure || 'unknown'}, purchased: ${ip.yearPurchased || 'unknown'} for ${formatMoney(ip.purchasePrice)}`).join('\n')}
Total estimated equity: ${formatMoney(totalEquity)}

Primary goal: ${p.goals.primaryGoal}
Goal detail: ${p.goals.goalDetail || 'Not specified'}
Time horizon: ${p.goals.timeHorizon}
Risk tolerance: ${p.goals.riskTolerance}
Strategy preference: ${p.goals.strategyPreference || 'unsure'}
Next step timeline: ${p.goals.nextStepTimeline || 'Not specified'}
Budget for next purchase: ${formatMoney(p.goals.budgetForNextPurchase)}
Target passive income: ${p.goals.targetPassiveIncome ? formatMoney(p.goals.targetPassiveIncome) + '/year' : 'Not specified'}

Preferred states: ${p.locationPrefs?.preferredStates?.join(', ') || 'Not specified'}
Preferred regions: ${p.locationPrefs?.preferredRegions?.join(', ') || 'Not specified'}
Open to interstate: ${p.locationPrefs?.openToInterstate ?? 'unknown'}

Tax rate: ${p.taxAndStructure?.marginalTaxRate || 'unknown'}
Accountant: ${p.taxAndStructure?.hasAccountant ?? 'unknown'}
Solicitor: ${p.taxAndStructure?.hasSolicitor ?? 'unknown'}
Financial planner: ${p.taxAndStructure?.hasFinancialPlanner ?? 'unknown'}
Existing structures: ${p.taxAndStructure?.existingStructures?.join(', ') || 'None'}
SMSF: ${p.taxAndStructure?.hasSMSF ? `Yes (${formatMoney(p.taxAndStructure.smsfBalance)})` : 'No'}

Experience: ${p.experience?.investingExperience || 'unknown'}
Years investing: ${p.experience?.yearsInvesting || 'unknown'}
Biggest challenge: ${p.experience?.biggestChallenge || 'Not specified'}`;
}

// ── Section 2: Financial Position ────────────────────────

const financialPosition: SectionConfig = {
  id: 2,
  title: 'Your Financial Position',
  ragQueries: [
    { query: 'understanding your financial position borrowing capacity serviceability', agents: ['Foundation Frank', 'ILR Methodology'], limit: 8 },
    { query: 'equity calculation accessible equity 80% rule', agents: ['Equity Eddie', 'ILR Methodology'], limit: 5 },
  ],
  buildPrompt: (profile, ragContext) => `You are writing Section 2 "Your Financial Position" of a personalised investment roadmap report for an ILR client.

${profileSummaryBlock(profile)}

ILR REFERENCE KNOWLEDGE:
${ragContext}

SECTION REQUIREMENTS:
- Open with a clear statement of where they stand financially right now
- Break down their income position (gross, net estimate, combined household if partner)
- Calculate accessible equity: (property values x 80%) - total mortgages. Show the math
- Calculate estimated borrowing capacity: if they provided it, use it. If not, estimate using income x 6 minus existing debts as a rough guide, and note this needs broker confirmation
- Detail their savings position and what's available as deposit/buffer
- List all debts and their impact on serviceability
- Calculate their maximum purchase price based on accessible equity + savings for deposit (assume 20% deposit + 5% costs)
- Identify any red flags (high credit card limits reducing borrowing, HECS impact, insufficient buffer)
- End with a summary of their investment capacity in dollar terms

${STYLE_RULES}`,
};

// ── Section 3: Portfolio Assessment ──────────────────────

const portfolioAssessment: SectionConfig = {
  id: 3,
  title: 'Portfolio Assessment',
  ragQueries: [
    { query: 'property portfolio analysis yield calculation equity growth', agents: ['Equity Eddie', 'Yield Yates', 'ILR Methodology'], limit: 8 },
    { query: 'rental yield gross yield net yield property performance', agents: ['Yield Yates', 'ILR Methodology'], limit: 5 },
  ],
  buildPrompt: (profile, ragContext) => `You are writing Section 3 "Portfolio Assessment" of a personalised investment roadmap report for an ILR client.

${profileSummaryBlock(profile)}

ILR REFERENCE KNOWLEDGE:
${ragContext}

SECTION REQUIREMENTS:
- If they have no properties: focus on their starting position, what they can afford, and how their first purchase sets the foundation. Cover what a strong first property looks like based on their budget
- If they own their home only: analyse it as an asset (equity, LVR), discuss how it enables investment, and what accessible equity unlocks
- If they have investment properties: analyse EACH property individually:
  - Gross yield: (weekly rent x 52) / current value x 100
  - Equity position: current value - mortgage owing
  - Capital growth since purchase: (current value - purchase price) / purchase price x 100
  - LVR: mortgage / current value x 100
  - Performance rating relative to ILR benchmarks
- Calculate portfolio totals: total value, total debt, total equity, weighted average yield, total rental income
- Assess the portfolio mix: is it growth-heavy, income-heavy, or balanced?
- Identify underperformers and opportunities (refinance potential, rent reviews, equity release)
- Note any structural issues (all in one name, concentration in one market)

${STYLE_RULES}`,
};

// ── Section 4: Strategy Recommendation ───────────────────

const strategyRecommendation: SectionConfig = {
  id: 4,
  title: 'Strategy Recommendation',
  ragQueries: [
    { query: 'investment strategy chunk deal income deal stacked strategy selection criteria', agents: ['Navigator Nate', 'Foundation Frank', 'ILR Methodology'], limit: 8 },
    { query: 'investor phases foundation ascension acceleration when to use each strategy', agents: ['Roadmap Ray', 'ILR Methodology'], limit: 5 },
    { query: 'risk tolerance conservative growth strategy matching financial position', agents: ['Navigator Nate', 'ILR Methodology'], limit: 4 },
  ],
  buildPrompt: (profile, ragContext) => `You are writing Section 4 "Strategy Recommendation" of a personalised investment roadmap report for an ILR client.

${profileSummaryBlock(profile)}

ILR REFERENCE KNOWLEDGE:
${ragContext}

SECTION REQUIREMENTS:
- Based on their financial position, goals, risk tolerance, and experience, recommend their optimal ILR strategy
- Explain which ILR Phase they sit in (Foundation / Ascension / Acceleration) and why
- Recommend a primary strategy (chunk deal, income deal, stacked, or foundation building) with clear reasoning
- Explain HOW this strategy works using their actual numbers:
  - If chunk deal: what purchase price, what manufactured growth target, realistic equity uplift
  - If income deal: target yield, cashflow impact on their serviceability, how it builds borrowing capacity
  - If stacked: how the combination of growth + income accelerates their position
  - If foundation: what they need to get in place first (broker, pre-approval, deposit target)
- Discuss 1-2 alternative strategies they could consider and why the primary is better for them right now
- Address their stated risk tolerance and how the recommendation aligns
- Connect the strategy to their stated goals and time horizon
- Be specific about expected outcomes: "a chunk deal at $X with $Y manufactured growth would add $Z to your equity position"

${STYLE_RULES}`,
};

// ── Section 5: 5-Year Roadmap ────────────────────────────

const fiveYearRoadmap: SectionConfig = {
  id: 5,
  title: '5-Year Investment Roadmap',
  ragQueries: [
    { query: 'property investment roadmap timeline year by year portfolio building', agents: ['Roadmap Ray', 'ILR Methodology'], limit: 8 },
    { query: 'property acquisition sequence how many properties per year scaling portfolio', agents: ['Finder Fred', 'Roadmap Ray', 'ILR Methodology'], limit: 5 },
  ],
  buildPrompt: (profile, ragContext, priorSections) => `You are writing Section 5 "5-Year Investment Roadmap" of a personalised investment roadmap report for an ILR client.

${profileSummaryBlock(profile)}

PRIOR SECTIONS (for context and consistency):
${priorSections}

ILR REFERENCE KNOWLEDGE:
${ragContext}

SECTION REQUIREMENTS:
- Map out a realistic year-by-year investment plan based on their actual financial position and the strategy recommended in Section 4
- Year 1: What they should do in the first 12 months (specific actions, not vague goals). Include target purchase price, location type, expected yield or growth
- Year 2: How the first acquisition changes their position, what becomes possible, next move
- Year 3: Portfolio review point - projected equity, cashflow, and capacity at this stage
- Year 4-5: Acceleration phase - how compounding equity and experience opens new opportunities
- For each year, show projected numbers: estimated portfolio value, total equity, annual cashflow, number of properties
- Include realistic assumptions (e.g., 5-7% capital growth, current interest rates, rental yield targets)
- If they have a target passive income, show the path to getting there (or be honest about whether 5 years is realistic)
- Account for their time horizon and risk tolerance
- Include contingency notes: what if rates rise, what if growth slows, what if they need to hold rather than buy
- This should feel like a concrete action plan, not a wishlist

${STYLE_RULES}`,
};

// ── Section 6: Deal Criteria & Search Parameters ─────────

const dealCriteria: SectionConfig = {
  id: 6,
  title: 'Deal Criteria & Search Parameters',
  ragQueries: [
    { query: 'deal criteria property search parameters what to look for investment property', agents: ['Finder Fred', 'ILR Methodology'], limit: 8 },
    { query: 'property due diligence location selection suburb research', agents: ['Finder Fred', 'Foundation Frank', 'ILR Methodology'], limit: 5 },
  ],
  buildPrompt: (profile, ragContext, priorSections) => `You are writing Section 6 "Deal Criteria & Search Parameters" of a personalised investment roadmap report for an ILR client.

${profileSummaryBlock(profile)}

PRIOR SECTIONS (for context and consistency):
${priorSections}

ILR REFERENCE KNOWLEDGE:
${ragContext}

SECTION REQUIREMENTS:
- Define their specific deal criteria based on strategy, budget, and goals
- Price range: min and max purchase price (derived from their accessible equity, savings, and borrowing capacity)
- Property types to target (houses, townhouses, units, duplexes, land) and why
- Target yield range (gross and net) based on their strategy
- Location criteria:
  - If they specified preferences, validate whether those areas suit their strategy and budget
  - Recommend 3-5 specific regions/corridors that match their criteria
  - Note key location factors: population growth, infrastructure, rental demand, supply pipeline
- Condition and age preferences (renovation potential for chunk deals, newer builds for income)
- Non-negotiables vs nice-to-haves
- Red flags to avoid (flood zones, mining towns, oversupply areas)
- What a "great deal" looks like for them specifically - give a concrete example with numbers
- How to use the ILR Property Advisor in this platform to search and evaluate deals

${STYLE_RULES}`,
};

// ── Section 7: Structure & Protection ────────────────────

const structureProtection: SectionConfig = {
  id: 7,
  title: 'Structure & Protection',
  ragQueries: [
    { query: 'asset protection ownership structure trust company personal name investment property', agents: ['Teflon Terry', 'ILR Methodology'], limit: 8 },
    { query: 'tax depreciation schedule property investor tax deductions', agents: ['Depreciation Dave', 'ILR Methodology'], limit: 5 },
    { query: 'SMSF property investment self managed super fund', agents: ['Teflon Terry', 'ILR Methodology'], limit: 3 },
  ],
  buildPrompt: (profile, ragContext) => `You are writing Section 7 "Structure & Protection" of a personalised investment roadmap report for an ILR client.

${profileSummaryBlock(profile)}

ILR REFERENCE KNOWLEDGE:
${ragContext}

SECTION REQUIREMENTS:
- Assess their current ownership structures and whether they are appropriate
- Based on their tax rate, portfolio size, and goals, recommend optimal structures:
  - Personal name: when and why (simplicity, negative gearing benefit at high tax rates)
  - Trust structures: when they make sense (asset protection, income distribution, estate planning)
  - Company: when warranted (portfolio size, land tax thresholds)
- Tax optimisation based on their marginal rate:
  - Negative gearing impact at their tax bracket
  - Depreciation benefits (new vs old properties, what to expect)
  - How their strategy choice (chunk vs income) interacts with their tax position
- SMSF considerations if they have one or are interested
- Insurance needs: landlord insurance, income protection, life insurance considerations
- Professional team assessment:
  - Which advisors they have vs which they need
  - Specific recommendations: "you mentioned you don't have a solicitor - this is essential before your next purchase for contract review and structure advice"
- Land tax considerations for their state(s) of investment
- Note: always caveat that structure advice needs to be confirmed with their accountant/solicitor for their specific circumstances

${STYLE_RULES}`,
};

// ── Section 8: Challenges & Next Steps ───────────────────

const challengesNextSteps: SectionConfig = {
  id: 8,
  title: 'Challenges & Next Steps',
  ragQueries: [
    { query: 'common investor challenges obstacles overcoming fear analysis paralysis taking action', agents: ['Navigator Nate', 'ILR Methodology'], limit: 8 },
    { query: 'next steps property investment getting started action plan', agents: ['Foundation Frank', 'Navigator Nate', 'ILR Methodology'], limit: 5 },
  ],
  buildPrompt: (profile, ragContext, priorSections) => `You are writing Section 8 "Challenges & Next Steps" of a personalised investment roadmap report for an ILR client.

${profileSummaryBlock(profile)}

PRIOR SECTIONS (for context and consistency):
${priorSections}

ILR REFERENCE KNOWLEDGE:
${ragContext}

SECTION REQUIREMENTS:
- Address their stated biggest challenge head-on with practical ILR guidance
- Identify 2-3 other likely challenges based on their profile (e.g., first-timer fear, analysis paralysis, partner alignment, time constraints, information overload)
- For each challenge, provide specific, actionable advice grounded in ILR methodology
- Data gaps: if their profile has gaps (borrowing capacity unknown, no broker, no pre-approval), list what they need to sort out first
- Create a prioritised "Next 30 Days" action list (5-7 items, numbered):
  1. Most critical action first
  2. Then subsequent steps in logical order
  3. Each with a clear, specific deliverable
- Create a "Next 90 Days" milestone list (3-4 items)
- Explain how to use the ILR Property Advisor going forward:
  - Ask strategy questions about your investment journey
  - Search for and evaluate property deals by pasting listing URLs
  - Request feasibility analysis by asking to "run the numbers"
  - Get guidance on finance structuring and asset protection
  - Ask about portfolio management and growth strategies
- End with an encouraging but realistic closing: acknowledge their position, reinforce that the plan is achievable, motivate them to take the first step

${STYLE_RULES}`,
};

// ── Section 1: Executive Summary (generated last) ────────

const executiveSummary: SectionConfig = {
  id: 1,
  title: 'Executive Summary',
  ragQueries: [],
  buildPrompt: (profile, _ragContext, priorSections) => `You are writing Section 1 "Executive Summary" of a personalised investment roadmap report for an ILR client. This section is generated LAST, after all other sections are complete.

${profileSummaryBlock(profile)}

ALL OTHER SECTIONS:
${priorSections}

SECTION REQUIREMENTS:
- Open with a personalised greeting: "${profile.personal.firstName}, here is your personalised investment roadmap"
- In 800-1000 words, summarise the key findings from all sections:
  - Their current financial position in one strong paragraph (income, equity, capacity)
  - Their recommended strategy and which ILR phase they are in
  - The 5-year projection headline numbers (portfolio value, equity, cashflow, properties)
  - Their deal criteria in brief (price range, target yield, preferred areas)
  - Their top 3 priorities / immediate next steps
- This should read as a standalone briefing - someone who only reads this section should understand the full picture
- Use specific numbers throughout, not generalities
- Tone: confident, personalised, action-oriented
- End with: "The sections that follow provide the detailed analysis behind each of these recommendations."

${STYLE_RULES}
- Aim for 800-1000 words for this section (shorter than other sections as it is a summary)`,
};

// ── Data Extraction Prompt ───────────────────────────────

export const DATA_EXTRACTION_PROMPT = `You are extracting structured data from a completed investment roadmap report.

Given the full report text and client profile, extract the following as valid JSON. Use exact numbers where possible; estimate where the report uses ranges or projections.

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation.

SCHEMA:
{
  "investorScore": number (0-100, based on: experience 20%, financial position 30%, portfolio 20%, readiness 15%, knowledge 15%),
  "strategyType": "chunk" | "income" | "stacked" | "foundation",
  "recommendedPhase": 1 | 2 | 3,
  "projections": {
    "year1": { "equity": number, "cashflow": number, "properties": number },
    "year3": { "equity": number, "cashflow": number, "properties": number },
    "year5": { "equity": number, "cashflow": number, "properties": number }
  },
  "dealCriteria": {
    "priceRange": { "min": number, "max": number },
    "targetYield": number,
    "propertyTypes": string[],
    "locations": string[]
  },
  "keyMetrics": {
    "accessibleEquity": number,
    "borrowingCapacity": number,
    "maxPurchasePrice": number,
    "currentNetYield": number | null
  },
  "topPriorities": string[] (3-5 items from the Next Steps section),
  "generatedAt": string (ISO date)
}`;

// ── Exports ──────────────────────────────────────────────

/** Sections to generate in order (2-8 first, then 1 last) */
export const GENERATION_SECTIONS: SectionConfig[] = [
  financialPosition,   // 2
  portfolioAssessment,  // 3
  strategyRecommendation, // 4
  fiveYearRoadmap,      // 5
  dealCriteria,         // 6
  structureProtection,  // 7
  challengesNextSteps,  // 8
];

export const EXECUTIVE_SUMMARY_SECTION = executiveSummary;

export { profileSummaryBlock };
