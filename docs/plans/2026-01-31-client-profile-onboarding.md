# Client Profile Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the thin `FinancialPosition` (9 fields, generic summary) with a comprehensive `ClientProfile` (40+ fields, per-agent briefs) so specialist agents can deliver personalised advice without repeatedly asking basic questions.

**Architecture:** The `ClientProfile` type replaces `FinancialPosition` everywhere. Extraction upgrades from GPT-4o-mini to Claude Sonnet via OpenRouter. Each agent receives a tailored brief paragraph plus structured JSON inside a `CLIENT FILE` block with behavioural rules preventing agents from announcing or summarising the data. Profile updates flow through Ben conversations using a merge extraction mode.

**Tech Stack:** TypeScript, Next.js, Zustand, OpenRouter (Claude Sonnet for extraction), Supabase (JSONB storage)

---

### Task 1: Define ClientProfile types

**Files:**
- Modify: `packages/web/src/lib/stores/financial-store.ts`

**Step 1: Replace FinancialPosition with ClientProfile types**

Replace the entire file contents with:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Sub-types ──────────────────────────────────────────

export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT';

export type EmploymentType =
  | 'payg-fulltime'
  | 'payg-parttime'
  | 'payg-casual'
  | 'self-employed-sole'
  | 'self-employed-company'
  | 'contractor'
  | 'mixed';

export type InvestmentGoalType =
  | 'first-property'
  | 'grow-portfolio'
  | 'passive-income'
  | 'development'
  | 'restructure'
  | 'retirement'
  | 'other';

export type TimeHorizon =
  | 'under-1-year'
  | '1-3-years'
  | '3-5-years'
  | '5-10-years'
  | '10-plus-years';

export type RiskTolerance = 'conservative' | 'moderate' | 'growth' | 'aggressive';

export type StrategyPreference =
  | 'capital-growth'
  | 'cash-flow'
  | 'balanced'
  | 'value-add'
  | 'unsure';

export type MarginalTaxRate = 'under-32.5' | '32.5' | '37' | '45' | 'unknown';

export type OwnershipStructure =
  | 'personal'
  | 'joint-personal'
  | 'family-trust'
  | 'unit-trust'
  | 'company'
  | 'smsf'
  | 'unknown';

export type PropertyType =
  | 'house'
  | 'townhouse'
  | 'unit-apartment'
  | 'duplex'
  | 'land'
  | 'commercial'
  | 'other';

export type ExperienceLevel =
  | 'beginner'
  | 'some-knowledge'
  | 'owner-occupier'
  | 'novice-investor'
  | 'experienced'
  | 'advanced';

// ── Data structures ────────────────────────────────────

export interface DebtItem {
  type: 'car-loan' | 'personal-loan' | 'credit-card' | 'hecs' | 'other';
  balance?: number;
  monthlyRepayment?: number;
}

export interface PropertySummary {
  location?: string;
  type?: PropertyType;
  currentValue?: number;
  mortgageOwing?: number;
  weeklyRent?: number;
  ownershipStructure?: OwnershipStructure;
  yearPurchased?: number;
  purchasePrice?: number;
}

// ── Profile sections ───────────────────────────────────

export interface PersonalBasics {
  firstName: string;
  age?: number;
  state: AustralianState;
  dependents?: number;
  partnerInvesting?: boolean;
  partnerIncome?: number;
}

export interface EmploymentIncome {
  grossAnnualIncome: number;
  employmentType: EmploymentType;
  yearsInRole?: number;
  hasHecsHelp?: boolean;
  hecsBalance?: number;
  otherIncomeStreams?: string;
  otherIncomeAmount?: number;
}

export interface FinancialSnapshot {
  cashSavings?: number;
  monthlyExpenses?: number;
  existingDebts?: DebtItem[];
  borrowingCapacity?: number;
  hasBroker?: boolean;
  hasPreApproval?: boolean;
  creditCardLimits?: number;
}

export interface PropertyPortfolio {
  ownsHome?: boolean;
  homeValue?: number;
  homeMortgage?: number;
  investmentProperties: PropertySummary[];
  totalEquity?: number;
}

export interface InvestmentGoals {
  primaryGoal: InvestmentGoalType;
  goalDetail?: string;
  timeHorizon: TimeHorizon;
  riskTolerance: RiskTolerance;
  strategyPreference?: StrategyPreference;
  nextStepTimeline?: string;
  budgetForNextPurchase?: number;
}

export interface LocationPreferences {
  preferredStates?: AustralianState[];
  preferredRegions?: string[];
  openToInterstate?: boolean;
  proximityPreference?: string;
}

export interface TaxAndStructure {
  marginalTaxRate?: MarginalTaxRate;
  hasAccountant?: boolean;
  hasSolicitor?: boolean;
  hasFinancialPlanner?: boolean;
  existingStructures?: OwnershipStructure[];
  interestedInStructuring?: boolean;
  hasSMSF?: boolean;
  smsfBalance?: number;
}

export interface ExperienceInfo {
  investingExperience: ExperienceLevel;
  yearsInvesting?: number;
  biggestChallenge?: string;
  specificQuestionsForToday?: string;
}

export interface AgentBriefs {
  baselineBen: string;
  finderFred: string;
  investorCoach: string;
  dealSpecialist: string;
}

// ── Complete profile ───────────────────────────────────

export interface ClientProfile {
  personal: PersonalBasics;
  employment: EmploymentIncome;
  financial: FinancialSnapshot;
  portfolio: PropertyPortfolio;
  goals: InvestmentGoals;
  locationPrefs?: LocationPreferences;
  taxAndStructure?: TaxAndStructure;
  experience?: ExperienceInfo;
  summary: string;
  agentBriefs: AgentBriefs;
  completenessScore: number;
  dataGaps: string[];
  collectedAt: string;
}

// ── Backward compat: keep old type as alias ────────────

/** @deprecated Use ClientProfile instead */
export type FinancialPosition = ClientProfile;

// ── Zustand store ──────────────────────────────────────

interface ClientProfileState {
  profile: ClientProfile | null;
  rawTranscript: string | null;
  setProfile: (profile: ClientProfile) => void;
  setRawTranscript: (transcript: string) => void;
  clear: () => void;
}

export const useClientProfileStore = create<ClientProfileState>()(
  persist(
    (set) => ({
      profile: null,
      rawTranscript: null,
      setProfile: (profile) => set({ profile }),
      setRawTranscript: (transcript) => set({ rawTranscript: transcript }),
      clear: () => set({ profile: null, rawTranscript: null }),
    }),
    {
      name: 'ilre-client-profile',
    }
  )
);

/** @deprecated Use useClientProfileStore instead */
export const useFinancialStore = useClientProfileStore;
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/reidbates/dev/ilragents && npx tsc --noEmit --project packages/web/tsconfig.json 2>&1 | head -30`
Expected: Type errors in files that still reference old `FinancialPosition` shape -- that's expected, we fix them in subsequent tasks.

**Step 3: Commit**

```bash
git add packages/web/src/lib/stores/financial-store.ts
git commit -m "feat: replace FinancialPosition with comprehensive ClientProfile type"
```

---

### Task 2: Rewrite extraction for Claude Sonnet + full profile

**Files:**
- Modify: `packages/web/src/lib/extract-financial-context.ts`

**Step 1: Rewrite the extraction module**

Replace the entire file contents with:

```typescript
import OpenAI from 'openai';
import type { ClientProfile } from './stores/financial-store';

function getOpenRouterClient(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://ilragents.app',
      'X-Title': 'ILRE Agents Onboarding',
    },
  });
}

const EXTRACTION_MODEL = 'anthropic/claude-sonnet-4';

const EXTRACTION_PROMPT = `You are a structured data extraction assistant for an Australian property investment advisory platform.

Given a conversation transcript between an onboarding agent ("Ben") and a client, extract a comprehensive client profile as JSON.

EXTRACTION RULES:
- Extract only what is explicitly stated or strongly implied in the conversation.
- Where the client gives vague answers, infer reasonable values. Examples:
  - Income over $180k implies marginalTaxRate "45"
  - "My accountant handles it" implies hasAccountant: true
  - "I'm a tradie with my own business" implies employmentType "self-employed-sole"
  - "We bought together" implies ownershipStructure "joint-personal"
- For investmentProperties: if 1-3 properties, extract full detail per property. If 4+, capture what was mentioned and estimate totals.
- Fields that cannot be determined should be omitted (not set to null).
- The summary field must be 4-8 sentences covering the full picture.
- Each agentBrief must be 150-300 words, written as a natural paragraph tailored to that agent's domain:
  - baselineBen: Full strategic overview - goals, position, experience, challenges
  - finderFred: Budget, location preferences, property type, timeline, strategy preference, cash/equity available
  - investorCoach: Full portfolio details (each property), serviceability, income, debts, cash flow, growth plan, borrowing capacity
  - dealSpecialist: Ownership structures, tax bracket, professional advisors, insurance, SMSF, entity structures, protection needs
- completenessScore: 0-100 based on how many essential fields were captured
- dataGaps: array of field names that could not be determined

Return ONLY valid JSON matching the ClientProfile schema. No markdown, no explanation.

SCHEMA:
{
  "personal": {
    "firstName": string,
    "age": number | undefined,
    "state": "NSW"|"VIC"|"QLD"|"SA"|"WA"|"TAS"|"NT"|"ACT",
    "dependents": number | undefined,
    "partnerInvesting": boolean | undefined,
    "partnerIncome": number | undefined
  },
  "employment": {
    "grossAnnualIncome": number,
    "employmentType": "payg-fulltime"|"payg-parttime"|"payg-casual"|"self-employed-sole"|"self-employed-company"|"contractor"|"mixed",
    "yearsInRole": number | undefined,
    "hasHecsHelp": boolean | undefined,
    "hecsBalance": number | undefined,
    "otherIncomeStreams": string | undefined,
    "otherIncomeAmount": number | undefined
  },
  "financial": {
    "cashSavings": number | undefined,
    "monthlyExpenses": number | undefined,
    "existingDebts": [{"type": string, "balance": number, "monthlyRepayment": number}] | undefined,
    "borrowingCapacity": number | undefined,
    "hasBroker": boolean | undefined,
    "hasPreApproval": boolean | undefined,
    "creditCardLimits": number | undefined
  },
  "portfolio": {
    "ownsHome": boolean | undefined,
    "homeValue": number | undefined,
    "homeMortgage": number | undefined,
    "investmentProperties": [{"location": string, "type": string, "currentValue": number, "mortgageOwing": number, "weeklyRent": number, "ownershipStructure": string, "yearPurchased": number, "purchasePrice": number}],
    "totalEquity": number | undefined
  },
  "goals": {
    "primaryGoal": "first-property"|"grow-portfolio"|"passive-income"|"development"|"restructure"|"retirement"|"other",
    "goalDetail": string | undefined,
    "timeHorizon": "under-1-year"|"1-3-years"|"3-5-years"|"5-10-years"|"10-plus-years",
    "riskTolerance": "conservative"|"moderate"|"growth"|"aggressive",
    "strategyPreference": "capital-growth"|"cash-flow"|"balanced"|"value-add"|"unsure" | undefined,
    "nextStepTimeline": string | undefined,
    "budgetForNextPurchase": number | undefined
  },
  "locationPrefs": {
    "preferredStates": string[] | undefined,
    "preferredRegions": string[] | undefined,
    "openToInterstate": boolean | undefined,
    "proximityPreference": string | undefined
  } | undefined,
  "taxAndStructure": {
    "marginalTaxRate": "under-32.5"|"32.5"|"37"|"45"|"unknown" | undefined,
    "hasAccountant": boolean | undefined,
    "hasSolicitor": boolean | undefined,
    "hasFinancialPlanner": boolean | undefined,
    "existingStructures": string[] | undefined,
    "interestedInStructuring": boolean | undefined,
    "hasSMSF": boolean | undefined,
    "smsfBalance": number | undefined
  } | undefined,
  "experience": {
    "investingExperience": "beginner"|"some-knowledge"|"owner-occupier"|"novice-investor"|"experienced"|"advanced",
    "yearsInvesting": number | undefined,
    "biggestChallenge": string | undefined,
    "specificQuestionsForToday": string | undefined
  } | undefined,
  "summary": string,
  "agentBriefs": {
    "baselineBen": string,
    "finderFred": string,
    "investorCoach": string,
    "dealSpecialist": string
  },
  "completenessScore": number,
  "dataGaps": string[],
  "collectedAt": string
}`;

const MERGE_PROMPT = `You are updating an existing client profile for an Australian property investment advisory platform.

Given the EXISTING profile and a NEW conversation transcript where the client has shared updated information, produce an updated profile.

MERGE RULES:
- Only update fields that the new conversation explicitly changes or adds.
- Fields not mentioned in the new conversation MUST keep their existing values.
- Always regenerate ALL agentBriefs from scratch using the merged data.
- Always regenerate the summary from the merged data.
- Recalculate completenessScore and dataGaps based on the merged result.
- Update collectedAt to the current timestamp.

Return ONLY valid JSON matching the ClientProfile schema. No markdown, no explanation.`;

export async function extractClientProfile(
  transcript: string
): Promise<ClientProfile> {
  const client = getOpenRouterClient();

  const response = await client.chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [
      { role: 'system', content: EXTRACTION_PROMPT },
      { role: 'user', content: transcript },
    ],
    temperature: 0.1,
    max_tokens: 3000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from extraction');

  // Strip markdown code fences if present
  const jsonStr = content.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
  const profile = JSON.parse(jsonStr) as ClientProfile;

  // Ensure collectedAt is set
  if (!profile.collectedAt) {
    profile.collectedAt = new Date().toISOString();
  }

  return profile;
}

export async function mergeClientProfile(
  existingProfile: ClientProfile,
  transcript: string
): Promise<{ profile: ClientProfile; hasChanges: boolean }> {
  const client = getOpenRouterClient();

  const response = await client.chat.completions.create({
    model: EXTRACTION_MODEL,
    messages: [
      { role: 'system', content: MERGE_PROMPT },
      {
        role: 'user',
        content: `EXISTING PROFILE:\n${JSON.stringify(existingProfile, null, 2)}\n\nNEW CONVERSATION:\n${transcript}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 3000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from merge extraction');

  const jsonStr = content.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '');
  const updated = JSON.parse(jsonStr) as ClientProfile;
  updated.collectedAt = new Date().toISOString();

  // Simple change detection: compare structured fields (not briefs/summary)
  const hasChanges =
    JSON.stringify({ ...existingProfile, summary: '', agentBriefs: null, collectedAt: '' }) !==
    JSON.stringify({ ...updated, summary: '', agentBriefs: null, collectedAt: '' });

  return { profile: updated, hasChanges };
}

/** @deprecated Use extractClientProfile instead */
export const extractFinancialContext = extractClientProfile;
```

**Step 2: Commit**

```bash
git add packages/web/src/lib/extract-financial-context.ts
git commit -m "feat: upgrade extraction to Claude Sonnet with full ClientProfile + merge mode"
```

---

### Task 3: Build CLIENT FILE injection in chat engine

**Files:**
- Modify: `packages/pipeline/src/pipeline/chat.ts`

**Step 1: Add buildClientFileBlock helper function**

Add this function after the `resolveResponseFormat` function (after line 106):

```typescript
/**
 * Build the CLIENT FILE block for injection into agent system prompts.
 * Contains behavioural rules + agent brief + structured data.
 */
export function buildClientFileBlock(financialContext: string): string {
  return `
── CLIENT FILE (reference only) ──────────────────────────

RULES FOR USING THIS DATA:
- This is background knowledge. You know it. Do not announce it.
- Never open by summarising the client's situation back to them.
- Only reference specific data points when the client's question directly requires them.
- If they ask a general knowledge question, answer it generally. Do not shoehorn their portfolio into every response.
- If their data would materially change the answer, weave it in naturally: "Given you're on the 37% marginal rate..." not "I see from your profile that..."
- Do NOT ask clarifying questions about information already present in this file.

${financialContext}
───────────────────────────────────────────────────────────`;
}
```

**Step 2: Replace the CLIENT BACKGROUND injection in the systemPromptOverride branch**

In the `prepareChatContext` function, replace lines 226-227:

Old:
```typescript
    if (financialContext) {
      parts.push(`CLIENT BACKGROUND (for context only - answer the client's actual question, do not steer the conversation toward their stated goals):\n${financialContext}`);
    }
```

New:
```typescript
    if (financialContext) {
      parts.push(buildClientFileBlock(financialContext));
    }
```

**Step 3: Replace the CLIENT BACKGROUND injection in the standard prompt branch**

Replace lines 237-243:

Old:
```typescript
    // Inject financial context if provided (as background info, not a directive)
    if (financialContext) {
      systemPrompt = systemPrompt.replace(
        format.instructions,
        `CLIENT BACKGROUND (for context only - answer the client's actual question, do not steer the conversation toward their stated goals):\n${financialContext}\n\n${format.instructions}`
      );
    }
```

New:
```typescript
    // Inject client file if provided (reference data with behavioural rules)
    if (financialContext) {
      systemPrompt = systemPrompt.replace(
        format.instructions,
        `${buildClientFileBlock(financialContext)}\n\n${format.instructions}`
      );
    }
```

**Step 4: Update the clarifying questions instruction**

In `buildSystemPrompt`, update line 136. Replace:

```
Do NOT ask more than 2 questions at a time. Do NOT ask questions the financial profile already answers. Always give something useful in your response even when asking for more info - never reply with only questions.
```

With:

```
Do NOT ask more than 2 questions at a time. Do NOT ask questions already answered in the CLIENT FILE. Always give something useful in your response even when asking for more info - never reply with only questions.
```

**Step 5: Commit**

```bash
git add packages/pipeline/src/pipeline/chat.ts
git commit -m "feat: replace CLIENT BACKGROUND with CLIENT FILE block and behavioural rules"
```

---

### Task 4: Pass agent-specific briefs from chat page

**Files:**
- Modify: `packages/web/src/app/chat/[agent]/page.tsx`

**Step 1: Update imports**

Replace line 8:

Old:
```typescript
import { useFinancialStore } from "@/lib/stores/financial-store";
```

New:
```typescript
import { useClientProfileStore } from "@/lib/stores/financial-store";
import type { AgentBriefs } from "@/lib/stores/financial-store";
```

**Step 2: Add agent brief key mapping**

Add after line 28 (after the `ResponseFormat` type):

```typescript
const AGENT_BRIEF_KEYS: Record<string, keyof AgentBriefs> = {
  'baseline-ben': 'baselineBen',
  'finder-fred': 'finderFred',
  'investor-coach': 'investorCoach',
  'deal-specialist': 'dealSpecialist',
};
```

**Step 3: Replace financialPosition store usage**

Replace line 38:

Old:
```typescript
  const financialPosition = useFinancialStore((s) => s.position);
```

New:
```typescript
  const clientProfile = useClientProfileStore((s) => s.profile);
```

**Step 4: Build agent-specific financial context**

Replace line 103:

Old:
```typescript
          financialContext: financialPosition?.summary || undefined,
```

New:
```typescript
          financialContext: clientProfile
            ? buildFinancialContext(clientProfile, agentSlug)
            : undefined,
```

Add this helper function before the component (after the `AGENT_BRIEF_KEYS` constant):

```typescript
function buildFinancialContext(
  profile: import("@/lib/stores/financial-store").ClientProfile,
  agentId: string
): string {
  const briefKey = AGENT_BRIEF_KEYS[agentId];
  const brief = briefKey ? profile.agentBriefs[briefKey] : profile.summary;

  // Build structured data section (omit briefs and summary to avoid duplication)
  const { agentBriefs: _briefs, summary: _summary, ...structuredData } = profile;

  return `${brief}\n\nCLIENT DATA:\n${JSON.stringify(structuredData, null, 2)}`;
}
```

**Step 5: Update VoiceChat financial context**

Replace line 340:

Old:
```typescript
          financialContext={financialPosition?.summary || undefined}
```

New:
```typescript
          financialContext={
            clientProfile
              ? buildFinancialContext(clientProfile, agent.id)
              : undefined
          }
```

**Step 6: Commit**

```bash
git add packages/web/src/app/chat/[agent]/page.tsx
git commit -m "feat: pass agent-specific briefs + structured JSON to each agent"
```

---

### Task 5: Update onboarding page

**Files:**
- Modify: `packages/web/src/app/onboarding/page.tsx`

**Step 1: Update imports**

Replace lines 6-7:

Old:
```typescript
import { useSessionStore } from '@/lib/stores/session-store';
import { useFinancialStore } from '@/lib/stores/financial-store';
```

New:
```typescript
import { useSessionStore } from '@/lib/stores/session-store';
import { useClientProfileStore } from '@/lib/stores/financial-store';
```

**Step 2: Update store hook**

Replace lines 17-18:

Old:
```typescript
  const setPosition = useFinancialStore((s) => s.setPosition);
  const setRawTranscript = useFinancialStore((s) => s.setRawTranscript);
```

New:
```typescript
  const setProfile = useClientProfileStore((s) => s.setProfile);
  const setRawTranscript = useClientProfileStore((s) => s.setRawTranscript);
```

**Step 3: Update handleOnboardingComplete**

Replace line 50:

Old:
```typescript
          setPosition(financialData);
```

New:
```typescript
          setProfile(financialData);
```

**Step 4: Commit**

```bash
git add packages/web/src/app/onboarding/page.tsx
git commit -m "feat: update onboarding page to use ClientProfile store"
```

---

### Task 6: Update extract API route for merge mode

**Files:**
- Modify: `packages/web/src/app/api/onboarding/extract/route.ts`

**Step 1: Replace the route handler**

Replace the entire file with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '../../.env') });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { transcript, sessionId, existingProfile } = body;

  if (!transcript) {
    return NextResponse.json(
      { error: 'transcript is required' },
      { status: 400 }
    );
  }

  try {
    const { extractClientProfile, mergeClientProfile } = await import(
      '@/lib/extract-financial-context'
    );

    let profileData;

    if (existingProfile) {
      // Merge mode: update existing profile with new conversation data
      const { profile, hasChanges } = await mergeClientProfile(
        existingProfile,
        transcript
      );
      profileData = profile;

      if (!hasChanges) {
        return NextResponse.json({ ...profileData, _noChanges: true });
      }
    } else {
      // Fresh extraction from onboarding
      profileData = await extractClientProfile(transcript);
    }

    // Persist to Supabase if sessionId provided (non-fatal if fails)
    if (sessionId) {
      try {
        const { getSupabaseClient } = await import('@/lib/supabase');
        const supabase = getSupabaseClient();

        await supabase.from('financial_positions').upsert(
          {
            session_id: sessionId,
            raw_transcript: transcript,
            structured_data: profileData,
            summary: profileData.summary,
          },
          { onConflict: 'session_id' }
        );
      } catch (dbError) {
        console.error('Failed to persist profile data:', dbError);
      }
    }

    return NextResponse.json(profileData);
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add packages/web/src/app/api/onboarding/extract/route.ts
git commit -m "feat: add merge mode to extraction route for profile updates"
```

---

### Task 7: Expand test profiles

**Files:**
- Modify: `packages/web/src/lib/test-profiles.ts`

**Step 1: Replace with full ClientProfile test data**

Replace the entire file with:

```typescript
import type { ClientProfile } from './stores/financial-store';

export interface TestProfile {
  id: string;
  label: string;
  description: string;
  profile: ClientProfile;
}

export const TEST_PROFILES: TestProfile[] = [
  {
    id: 'first-timer',
    label: 'Sarah - First Timer',
    description: 'No properties, starting from scratch',
    profile: {
      personal: {
        firstName: 'Sarah',
        age: 28,
        state: 'VIC',
        dependents: 0,
        partnerInvesting: false,
      },
      employment: {
        grossAnnualIncome: 85000,
        employmentType: 'payg-fulltime',
        yearsInRole: 3,
        hasHecsHelp: true,
        hecsBalance: 28000,
      },
      financial: {
        cashSavings: 45000,
        monthlyExpenses: 4600,
        existingDebts: [
          { type: 'hecs', balance: 28000 },
        ],
        borrowingCapacity: 450000,
        hasBroker: false,
        hasPreApproval: false,
        creditCardLimits: 5000,
      },
      portfolio: {
        ownsHome: false,
        investmentProperties: [],
        totalEquity: 0,
      },
      goals: {
        primaryGoal: 'first-property',
        goalDetail: 'Buy first investment property within 12 months',
        timeHorizon: '10-plus-years',
        riskTolerance: 'moderate',
        strategyPreference: 'unsure',
        nextStepTimeline: 'Next 6-12 months',
        budgetForNextPurchase: 450000,
      },
      locationPrefs: {
        preferredStates: ['VIC'],
        openToInterstate: true,
        proximityPreference: 'Metro and major regional',
      },
      taxAndStructure: {
        marginalTaxRate: '32.5',
        hasAccountant: false,
        hasSolicitor: false,
        existingStructures: [],
      },
      experience: {
        investingExperience: 'some-knowledge',
        biggestChallenge: 'Not sure where to start or what type of property to look for',
      },
      summary: 'Sarah is a 28-year-old first-time investor based in Victoria, earning $85k/year as a PAYG employee. She has $45k in savings but no existing properties or equity. Her borrowing capacity is around $450k. She has a $28k HECS debt. She wants to buy her first investment property within the next 12 months and is open to interstate purchases. She has a moderate risk tolerance and a long-term horizon of 10+ years but is unsure whether to focus on growth or cash flow.',
      agentBriefs: {
        baselineBen: 'Sarah is a first-time investor based in VIC, 28 years old, earning $85k PAYG full-time. She has $45k savings, $450k borrowing capacity, and a $28k HECS debt. No existing properties. Her goal is to buy her first investment property within 12 months. She has a moderate risk tolerance with a 10+ year horizon but is unsure on strategy - needs guidance on whether to pursue growth or cash flow. No broker, no accountant, no pre-approval yet. Her biggest challenge is knowing where to start.',
        finderFred: 'Sarah is looking to buy her first investment property within the next 6-12 months. Budget is around $450k based on borrowing capacity. She has $45k cash for deposit. Based in VIC but open to interstate for the right deal. Prefers metro and major regional areas. No strategy preference yet - needs guidance on property type and location. No existing portfolio. PAYG on $85k, moderate risk tolerance.',
        investorCoach: 'Sarah earns $85k/year PAYG full-time, 3 years in role. No existing properties - this will be her first investment purchase. $45k cash savings, $4,600/month expenses. $28k HECS debt reducing borrowing capacity. Total borrowing capacity $450k. No broker or pre-approval yet. $5k credit card limit. No other income streams. Goal is to build a portfolio over 10+ years starting with first purchase in the next 12 months. Moderate risk tolerance, unsure on growth vs cash flow strategy.',
        dealSpecialist: 'Sarah has no existing ownership structures - no trusts, companies, or SMSF. She is on the 32.5% marginal tax rate ($85k income). No accountant or solicitor engaged. No financial planner. This is her first property purchase so structure decisions are being made from scratch. No dependents, not investing with a partner. No insurance considerations yet as no portfolio exists.',
      },
      completenessScore: 78,
      dataGaps: ['partnerIncome', 'otherIncomeStreams', 'hasFinancialPlanner', 'interestedInStructuring'],
      collectedAt: '2026-01-31T00:00:00.000Z',
    },
  },
  {
    id: 'growing-portfolio',
    label: 'James - Growing Portfolio',
    description: '2 properties, $180k equity, scaling up',
    profile: {
      personal: {
        firstName: 'James',
        age: 35,
        state: 'VIC',
        dependents: 2,
        partnerInvesting: true,
        partnerIncome: 75000,
      },
      employment: {
        grossAnnualIncome: 130000,
        employmentType: 'payg-fulltime',
        yearsInRole: 6,
        hasHecsHelp: true,
        hecsBalance: 12000,
        otherIncomeStreams: 'Rental income from 2 investment properties',
        otherIncomeAmount: 54000,
      },
      financial: {
        cashSavings: 85000,
        monthlyExpenses: 6500,
        existingDebts: [
          { type: 'hecs', balance: 12000 },
          { type: 'car-loan', balance: 18000, monthlyRepayment: 450 },
        ],
        borrowingCapacity: 720000,
        hasBroker: true,
        hasPreApproval: false,
        creditCardLimits: 15000,
      },
      portfolio: {
        ownsHome: true,
        homeValue: 850000,
        homeMortgage: 520000,
        investmentProperties: [
          {
            location: 'Brunswick, VIC',
            type: 'unit-apartment',
            currentValue: 620000,
            mortgageOwing: 480000,
            weeklyRent: 520,
            ownershipStructure: 'personal',
            yearPurchased: 2021,
            purchasePrice: 545000,
          },
          {
            location: 'Geelong, VIC',
            type: 'house',
            currentValue: 485000,
            mortgageOwing: 390000,
            weeklyRent: 410,
            ownershipStructure: 'joint-personal',
            yearPurchased: 2023,
            purchasePrice: 460000,
          },
        ],
        totalEquity: 180000,
      },
      goals: {
        primaryGoal: 'grow-portfolio',
        goalDetail: 'Scale to 5 properties in the next 3 years using equity recycling',
        timeHorizon: '3-5-years',
        riskTolerance: 'growth',
        strategyPreference: 'capital-growth',
        nextStepTimeline: 'Next 6 months',
        budgetForNextPurchase: 550000,
      },
      locationPrefs: {
        preferredStates: ['VIC', 'QLD'],
        preferredRegions: ['South-east QLD', 'Geelong corridor'],
        openToInterstate: true,
        proximityPreference: 'Metro and major regional',
      },
      taxAndStructure: {
        marginalTaxRate: '37',
        hasAccountant: true,
        hasSolicitor: false,
        existingStructures: ['personal', 'joint-personal'],
        interestedInStructuring: true,
      },
      experience: {
        investingExperience: 'novice-investor',
        yearsInvesting: 3,
        biggestChallenge: 'Not sure how to access equity without selling',
        specificQuestionsForToday: 'Want to understand trust structures for future acquisitions',
      },
      summary: 'James is a 35-year-old investor based in Victoria with 2 investment properties and a PPOR. He earns $130k PAYG plus $75k from his partner, with $54k rental income. He has $180k usable equity, $85k cash, and $720k borrowing capacity. Properties are held in personal and joint names - he is interested in moving to trust structures. His goal is to scale to 5 properties within 3 years using equity recycling, targeting capital growth in VIC and QLD. He has a broker and accountant but no solicitor.',
      agentBriefs: {
        baselineBen: 'James is 35, based in VIC, with 2 investment properties plus a PPOR. He earns $130k PAYG (partner $75k), has $180k usable equity and $720k borrowing capacity. Goal is to scale from 2 to 5 properties in 3 years via equity recycling, focusing on capital growth. He has 3 years of investing experience but is unsure how to access equity without selling. He wants to explore trust structures for future purchases. Has a broker and accountant. Growth-oriented risk tolerance. 2 dependents.',
        finderFred: 'James is looking to buy his next property within 6 months, budget around $550k. He has $85k cash and $180k usable equity across his portfolio. Prefers VIC and QLD - specifically the Geelong corridor and south-east QLD. Open to interstate. Strategy is capital growth focused. Currently has a unit in Brunswick and a house in Geelong. Looking for his 3rd investment property on the path to 5 total. Has a broker. PAYG on $130k plus partner income of $75k.',
        investorCoach: 'James earns $130k/year PAYG, 6 years in role. Partner earns $75k and co-invests. PPOR worth $850k with $520k mortgage. Investment property 1: Brunswick unit, $620k value, $480k owing, $520/wk rent, personal name, bought 2021 for $545k. Investment property 2: Geelong house, $485k value, $390k owing, $410/wk rent, joint names, bought 2023 for $460k. Total equity ~$180k. Borrowing capacity $720k. $85k cash. $12k HECS, $18k car loan ($450/mo), $15k credit card limits. $6,500/mo expenses. 2 dependents. Goal: scale to 5 properties in 3 years via equity recycling, capital growth strategy.',
        dealSpecialist: 'James holds properties in personal name (Brunswick unit) and joint-personal name with partner (Geelong house). PPOR in joint names. No trusts or companies set up but actively interested in structuring future acquisitions through trusts. Marginal tax rate 37% ($130k + $54k rental). Has an accountant. No solicitor. No financial planner. No SMSF. 2 dependents. Partner co-invests. Looking at 3+ more purchases over 3 years so structure decisions are urgent.',
      },
      completenessScore: 92,
      dataGaps: ['hasFinancialPlanner', 'hasInsurance'],
      collectedAt: '2026-01-31T00:00:00.000Z',
    },
  },
  {
    id: 'high-equity',
    label: 'Karen - High Equity',
    description: '4 properties, $620k equity, looking at development',
    profile: {
      personal: {
        firstName: 'Karen',
        age: 45,
        state: 'QLD',
        dependents: 1,
        partnerInvesting: false,
      },
      employment: {
        grossAnnualIncome: 175000,
        employmentType: 'self-employed-company',
        yearsInRole: 12,
        hasHecsHelp: false,
        otherIncomeStreams: 'Share dividends, rental income from 4 properties',
        otherIncomeAmount: 95000,
      },
      financial: {
        cashSavings: 220000,
        monthlyExpenses: 7900,
        existingDebts: [],
        borrowingCapacity: 1200000,
        hasBroker: true,
        hasPreApproval: true,
        creditCardLimits: 30000,
      },
      portfolio: {
        ownsHome: true,
        homeValue: 1100000,
        homeMortgage: 280000,
        investmentProperties: [
          {
            location: 'Newstead, QLD',
            type: 'unit-apartment',
            currentValue: 580000,
            mortgageOwing: 320000,
            weeklyRent: 550,
            ownershipStructure: 'family-trust',
            yearPurchased: 2017,
            purchasePrice: 420000,
          },
          {
            location: 'Cannon Hill, QLD',
            type: 'house',
            currentValue: 780000,
            mortgageOwing: 450000,
            weeklyRent: 580,
            ownershipStructure: 'family-trust',
            yearPurchased: 2019,
            purchasePrice: 590000,
          },
          {
            location: 'Logan, QLD',
            type: 'duplex',
            currentValue: 620000,
            mortgageOwing: 400000,
            weeklyRent: 680,
            ownershipStructure: 'family-trust',
            yearPurchased: 2020,
            purchasePrice: 485000,
          },
          {
            location: 'Ipswich, QLD',
            type: 'house',
            currentValue: 450000,
            mortgageOwing: 340000,
            weeklyRent: 420,
            ownershipStructure: 'personal',
            yearPurchased: 2022,
            purchasePrice: 380000,
          },
        ],
        totalEquity: 620000,
      },
      goals: {
        primaryGoal: 'development',
        goalDetail: 'Explore subdivision and development opportunities to accelerate wealth',
        timeHorizon: '3-5-years',
        riskTolerance: 'aggressive',
        strategyPreference: 'value-add',
        nextStepTimeline: 'Next 3 months',
        budgetForNextPurchase: 800000,
      },
      locationPrefs: {
        preferredStates: ['QLD'],
        preferredRegions: ['Brisbane metro', 'Gold Coast corridor'],
        openToInterstate: false,
        proximityPreference: 'Metro only',
      },
      taxAndStructure: {
        marginalTaxRate: '45',
        hasAccountant: true,
        hasSolicitor: true,
        hasFinancialPlanner: true,
        existingStructures: ['family-trust', 'personal'],
        interestedInStructuring: false,
        hasSMSF: true,
        smsfBalance: 380000,
      },
      experience: {
        investingExperience: 'experienced',
        yearsInvesting: 8,
        biggestChallenge: 'Finding development-grade sites with the right zoning',
        specificQuestionsForToday: 'How to structure a subdivision JV',
      },
      summary: 'Karen is a 45-year-old experienced investor based in QLD, running her own company earning $175k plus $95k from investments. She has 4 investment properties plus a PPOR, with $620k usable equity and $1.2M borrowing capacity. Most properties held in a family trust, one in personal name. She has a full advisory team (accountant, solicitor, financial planner) and a $380k SMSF. Her focus is now on development and subdivision - she wants to find development sites in Brisbane metro within the next 3 months. Aggressive risk tolerance.',
      agentBriefs: {
        baselineBen: 'Karen is an experienced investor (8 years, 4 properties) based in QLD. Self-employed through her own company, earning $175k + $95k investment income. $620k equity, $1.2M borrowing capacity, $220k cash. She has moved past buy-and-hold and wants to pursue subdivision and development in Brisbane metro. Full advisory team in place. Family trust structures established. SMSF with $380k. 1 dependent. Her challenge is finding the right development sites with appropriate zoning. Aggressive risk tolerance, 3-5 year active strategy.',
        finderFred: 'Karen is looking for development-grade sites in Brisbane metro and Gold Coast corridor, budget up to $800k. She wants to move within 3 months - has pre-approval and $220k cash plus $620k equity. Not open to interstate. Metro locations only. She already owns in Newstead, Cannon Hill, Logan, and Ipswich. Strategy is value-add/development, specifically subdivision. She has 8 years experience and a broker. Self-employed on $175k.',
        investorCoach: 'Karen earns $175k self-employed (Pty Ltd), 12 years running. $95k additional income from shares and rent. PPOR worth $1.1M with $280k owing. Property 1: Newstead unit, $580k value, $320k owing, $550/wk rent, family trust, bought 2017. Property 2: Cannon Hill house, $780k value, $450k owing, $580/wk, family trust, bought 2019. Property 3: Logan duplex, $620k value, $400k owing, $680/wk, family trust, bought 2020. Property 4: Ipswich house, $450k value, $340k owing, $420/wk, personal name, bought 2022. Total equity $620k. Borrowing capacity $1.2M. $220k cash. $7,900/mo expenses. No debts outside mortgages. $30k credit card limits. Pre-approved. Goal: development and subdivision.',
        dealSpecialist: 'Karen has a family trust holding 3 of 4 investment properties (Newstead, Cannon Hill, Logan). Ipswich property in personal name. PPOR in personal name. Marginal tax rate 45% ($175k + $95k investment income). Full advisory team: accountant, solicitor, financial planner. SMSF with $380k balance. Not looking for new structures - existing trust setup works well. 1 dependent. Interested in structuring a subdivision JV. Self-employed through Pty Ltd, 12 years.',
      },
      completenessScore: 95,
      dataGaps: ['hecsBalance', 'partnerIncome'],
      collectedAt: '2026-01-31T00:00:00.000Z',
    },
  },
  {
    id: 'cash-flow-focused',
    label: 'Mike - Cash Flow Focused',
    description: '1 property, wants passive income',
    profile: {
      personal: {
        firstName: 'Mike',
        age: 52,
        state: 'SA',
        dependents: 0,
        partnerInvesting: false,
      },
      employment: {
        grossAnnualIncome: 95000,
        employmentType: 'payg-fulltime',
        yearsInRole: 15,
        hasHecsHelp: false,
      },
      financial: {
        cashSavings: 60000,
        monthlyExpenses: 5200,
        existingDebts: [],
        borrowingCapacity: 520000,
        hasBroker: true,
        hasPreApproval: false,
        creditCardLimits: 8000,
      },
      portfolio: {
        ownsHome: true,
        homeValue: 550000,
        homeMortgage: 180000,
        investmentProperties: [
          {
            location: 'Elizabeth, SA',
            type: 'house',
            currentValue: 380000,
            mortgageOwing: 260000,
            weeklyRent: 370,
            ownershipStructure: 'personal',
            yearPurchased: 2020,
            purchasePrice: 295000,
          },
        ],
        totalEquity: 85000,
      },
      goals: {
        primaryGoal: 'passive-income',
        goalDetail: 'Build passive rental income to replace salary within 15 years',
        timeHorizon: '10-plus-years',
        riskTolerance: 'conservative',
        strategyPreference: 'cash-flow',
        nextStepTimeline: 'Next 12 months',
        budgetForNextPurchase: 400000,
      },
      locationPrefs: {
        preferredStates: ['SA', 'QLD'],
        openToInterstate: true,
        preferredRegions: ['Adelaide metro', 'Regional QLD'],
        proximityPreference: 'Happy with regional',
      },
      taxAndStructure: {
        marginalTaxRate: '32.5',
        hasAccountant: true,
        hasSolicitor: false,
        existingStructures: ['personal'],
        interestedInStructuring: false,
      },
      experience: {
        investingExperience: 'novice-investor',
        yearsInvesting: 4,
        biggestChallenge: 'Finding cash-flow-positive properties in the current market',
      },
      summary: 'Mike is a 52-year-old conservative investor based in South Australia, earning $95k PAYG. He has 1 investment property (Elizabeth, SA) plus a PPOR, with $85k usable equity and $520k borrowing capacity. His focus is building passive rental income to replace his salary within 15 years. He prefers cash-flow-positive properties and is open to SA and QLD including regional areas. Has a broker and accountant. $60k cash. No dependents, no partner co-investing.',
      agentBriefs: {
        baselineBen: 'Mike is 52, based in SA, conservative investor with a 15-year plan to replace his $95k salary with passive rental income. Has 1 investment property in Elizabeth SA plus a PPOR. $85k equity, $520k borrowing, $60k cash. 4 years experience. Cash-flow strategy. His challenge is finding properties that are actually cash-flow positive in the current market. Has a broker and accountant. No dependents, not investing with a partner. Needs a realistic roadmap to hit his income replacement goal.',
        finderFred: 'Mike is looking for his 2nd investment property within the next 12 months. Budget around $400k. Cash-flow strategy - must be cash-flow positive or very close to it. Open to SA (Adelaide metro) and QLD (regional). Happy with regional areas. Has $60k cash and $85k equity. Has a broker. Currently owns in Elizabeth, SA. PAYG on $95k, conservative risk tolerance. Prefers houses based on current portfolio.',
        investorCoach: 'Mike earns $95k/year PAYG, 15 years in role. No HECS, no other debts. PPOR worth $550k with $180k owing. Investment property: Elizabeth SA house, $380k value, $260k owing, $370/wk rent, personal name, bought 2020 for $295k. Total equity $85k. Borrowing capacity $520k. $60k cash. $5,200/mo expenses. $8k credit card limits. No dependents. Goal: build passive income stream to replace salary in 15 years. Conservative risk tolerance, cash-flow focused. Needs to model how many properties and what yield to hit his target.',
        dealSpecialist: 'Mike holds his investment property and PPOR in personal name. No trusts, companies, or SMSF. Not interested in restructuring at this stage. Marginal tax rate 32.5% ($95k income). Has an accountant. No solicitor or financial planner. No dependents, not investing with a partner. Conservative approach - asset protection is less of a concern given small portfolio. May need to revisit structures as portfolio grows.',
      },
      completenessScore: 82,
      dataGaps: ['age', 'otherIncomeStreams', 'hasFinancialPlanner', 'smsfBalance'],
      collectedAt: '2026-01-31T00:00:00.000Z',
    },
  },
  {
    id: 'asset-protection',
    label: 'Linda - Structure & Protection',
    description: '3 properties, needs trust/company structures',
    profile: {
      personal: {
        firstName: 'Linda',
        age: 41,
        state: 'NSW',
        dependents: 3,
        partnerInvesting: true,
        partnerIncome: 120000,
      },
      employment: {
        grossAnnualIncome: 210000,
        employmentType: 'payg-fulltime',
        yearsInRole: 8,
        hasHecsHelp: false,
        otherIncomeStreams: 'Rental income from 3 properties, partner income',
        otherIncomeAmount: 78000,
      },
      financial: {
        cashSavings: 150000,
        monthlyExpenses: 10000,
        existingDebts: [
          { type: 'car-loan', balance: 25000, monthlyRepayment: 600 },
        ],
        borrowingCapacity: 950000,
        hasBroker: true,
        hasPreApproval: false,
        creditCardLimits: 20000,
      },
      portfolio: {
        ownsHome: true,
        homeValue: 1400000,
        homeMortgage: 650000,
        investmentProperties: [
          {
            location: 'Parramatta, NSW',
            type: 'unit-apartment',
            currentValue: 650000,
            mortgageOwing: 480000,
            weeklyRent: 520,
            ownershipStructure: 'personal',
            yearPurchased: 2018,
            purchasePrice: 530000,
          },
          {
            location: 'Newcastle, NSW',
            type: 'house',
            currentValue: 720000,
            mortgageOwing: 520000,
            weeklyRent: 560,
            ownershipStructure: 'joint-personal',
            yearPurchased: 2020,
            purchasePrice: 580000,
          },
          {
            location: 'Wollongong, NSW',
            type: 'townhouse',
            currentValue: 580000,
            mortgageOwing: 430000,
            weeklyRent: 480,
            ownershipStructure: 'personal',
            yearPurchased: 2022,
            purchasePrice: 520000,
          },
        ],
        totalEquity: 450000,
      },
      goals: {
        primaryGoal: 'restructure',
        goalDetail: 'Restructure holdings into trusts and optimise tax position',
        timeHorizon: '5-10-years',
        riskTolerance: 'moderate',
        strategyPreference: 'balanced',
        nextStepTimeline: 'Next 3-6 months',
        budgetForNextPurchase: 700000,
      },
      locationPrefs: {
        preferredStates: ['NSW', 'QLD'],
        openToInterstate: true,
        preferredRegions: ['Sydney metro', 'Central Coast', 'South-east QLD'],
      },
      taxAndStructure: {
        marginalTaxRate: '45',
        hasAccountant: true,
        hasSolicitor: false,
        hasFinancialPlanner: false,
        existingStructures: ['personal', 'joint-personal'],
        interestedInStructuring: true,
        hasSMSF: false,
      },
      experience: {
        investingExperience: 'novice-investor',
        yearsInvesting: 6,
        biggestChallenge: 'Properties all in personal names, paying too much tax, worried about asset protection',
        specificQuestionsForToday: 'How to move existing properties into trust structures',
      },
      summary: 'Linda is a 41-year-old investor based in NSW earning $210k plus $120k from her partner. She has 3 investment properties plus a PPOR, all held in personal or joint-personal names. $450k equity, $950k borrowing capacity, $150k cash. Her primary concern is restructuring into trusts for asset protection and tax optimisation - she is on the 45% marginal rate and feels she is paying too much tax. Has an accountant but no solicitor or financial planner. 3 dependents. Partner co-invests. 6 years experience.',
      agentBriefs: {
        baselineBen: 'Linda is 41, based in NSW, earning $210k (partner $120k). 3 investment properties plus PPOR, all in personal/joint names. $450k equity, $950k borrowing, $150k cash. 6 years experience but still a novice in structures. Her top priority is restructuring into trusts for asset protection and tax optimisation - she is on the 45% rate and feels overexposed. Has a broker and accountant but no solicitor. 3 dependents. Moderate risk tolerance, balanced strategy. Wants to continue growing the portfolio while fixing the structural issues.',
        finderFred: 'Linda is looking to buy her 4th investment property within 3-6 months, budget around $700k. Prefers NSW (Sydney metro, Central Coast) and south-east QLD. Open to interstate. Has $150k cash and $450k equity. Balanced strategy - mix of growth and cash flow. Currently owns in Parramatta, Newcastle, and Wollongong. Has a broker. PAYG on $210k plus partner $120k. Moderate risk tolerance. Note: she is in the process of restructuring so new purchases may need to go into a trust.',
        investorCoach: 'Linda earns $210k/year PAYG, 8 years in role. Partner earns $120k and co-invests. PPOR worth $1.4M with $650k owing. Property 1: Parramatta unit, $650k value, $480k owing, $520/wk rent, personal name, bought 2018 for $530k. Property 2: Newcastle house, $720k value, $520k owing, $560/wk, joint names, bought 2020 for $580k. Property 3: Wollongong townhouse, $580k value, $430k owing, $480/wk, personal name, bought 2022 for $520k. Total equity $450k. Borrowing capacity $950k. $150k cash. $25k car loan ($600/mo). $10k/mo expenses. $20k credit card limits. 3 dependents. Goal: restructure for tax and protection while continuing to grow. Balanced strategy.',
        dealSpecialist: 'Linda holds all properties in personal or joint-personal names - no trusts, companies, or SMSF. This is her primary pain point. She wants to restructure into trust structures for asset protection and tax optimisation. Marginal tax rate 45% ($210k + $78k rental income). Has an accountant but NO solicitor or financial planner - will need both for restructuring. 3 dependents. Partner co-invests ($120k income). Key question: how to move existing properties into trusts (stamp duty implications, CGT triggers). Portfolio: Parramatta (personal), Newcastle (joint), Wollongong (personal). 6 years investing experience.',
      },
      completenessScore: 88,
      dataGaps: ['proximityPreference', 'smsfBalance', 'yearsInvesting'],
      collectedAt: '2026-01-31T00:00:00.000Z',
    },
  },
];
```

**Step 2: Commit**

```bash
git add packages/web/src/lib/test-profiles.ts
git commit -m "feat: expand test profiles to full ClientProfile with agent briefs"
```

---

### Task 8: Update eval profiles

**Files:**
- Modify: `packages/pipeline/src/pipeline/eval/profiles.ts`

**Step 1: Add agent briefs to eval profiles**

Replace the entire file with:

```typescript
/**
 * Financial profiles for eval scenarios.
 * Includes per-agent briefs for testing context-awareness with rich data.
 */

export interface AgentBriefs {
  baselineBen: string;
  finderFred: string;
  investorCoach: string;
  dealSpecialist: string;
}

export interface EvalProfile {
  id: string;
  label: string;
  summary: string;
  agentBriefs: AgentBriefs;
}

export const EVAL_PROFILES: EvalProfile[] = [
  {
    id: 'sarah-first-timer',
    label: 'Sarah - First Timer',
    summary:
      'Sarah is a 28-year-old first-time investor based in Victoria, earning $85k/year PAYG. $45k savings, $450k borrowing capacity, $28k HECS debt. No properties. Wants to buy first investment property within 12 months. Moderate risk tolerance, 10+ year horizon, unsure on strategy.',
    agentBriefs: {
      baselineBen: 'Sarah is a first-time investor based in VIC, 28 years old, earning $85k PAYG full-time. She has $45k savings, $450k borrowing capacity, and a $28k HECS debt. No existing properties. Her goal is to buy her first investment property within 12 months. Moderate risk tolerance with a 10+ year horizon but unsure on strategy. No broker, no accountant, no pre-approval. Biggest challenge: knowing where to start.',
      finderFred: 'Sarah is looking for her first investment property within 6-12 months. Budget around $450k. $45k cash for deposit. Based in VIC but open to interstate. Prefers metro and major regional. No strategy preference yet. PAYG on $85k, moderate risk tolerance.',
      investorCoach: 'Sarah earns $85k/year PAYG, 3 years in role. No existing properties. $45k cash, $4,600/mo expenses. $28k HECS debt. Borrowing capacity $450k. No broker or pre-approval. $5k credit card limits. Goal: first purchase within 12 months, build portfolio over 10+ years. Moderate risk tolerance, unsure on growth vs cash flow.',
      dealSpecialist: 'Sarah has no existing structures - no trusts, companies, or SMSF. On 32.5% marginal tax rate ($85k). No accountant or solicitor. First property purchase so structure decisions are from scratch. No dependents, not investing with a partner.',
    },
  },
  {
    id: 'james-growing-portfolio',
    label: 'James - Growing Portfolio',
    summary:
      'James is a 35-year-old investor based in VIC with 2 investment properties and a PPOR. Earns $130k PAYG, partner $75k. $180k equity, $720k borrowing, $85k cash. Properties in personal and joint names, interested in trusts. Goal: scale to 5 properties in 3 years via equity recycling. Growth strategy.',
    agentBriefs: {
      baselineBen: 'James is 35, based in VIC, with 2 investment properties plus a PPOR. Earns $130k PAYG (partner $75k), $180k equity, $720k borrowing. Goal: scale from 2 to 5 properties in 3 years via equity recycling, capital growth focus. 3 years experience, wants to explore trust structures. Has broker and accountant. 2 dependents.',
      finderFred: 'James wants his 3rd investment property within 6 months, budget $550k. $85k cash, $180k equity. Prefers VIC and QLD (Geelong corridor, south-east QLD). Open to interstate. Capital growth strategy. Owns in Brunswick (unit) and Geelong (house). Has a broker. PAYG on $130k plus partner $75k.',
      investorCoach: 'James earns $130k PAYG, partner $75k. PPOR $850k/$520k mortgage. Investment 1: Brunswick unit, $620k/$480k, $520/wk rent, personal name. Investment 2: Geelong house, $485k/$390k, $410/wk, joint names. $180k equity, $720k borrowing, $85k cash. $12k HECS, $18k car loan. $6,500/mo expenses. 2 dependents. Goal: 5 properties in 3 years, capital growth, equity recycling.',
      dealSpecialist: 'James has personal name (Brunswick unit) and joint-personal (Geelong house, PPOR). No trusts or companies but interested in structuring future acquisitions. 37% marginal rate ($130k + $54k rental). Has accountant, no solicitor. No SMSF. 2 dependents, partner co-invests. 3+ more purchases planned so structure decisions are urgent.',
    },
  },
  {
    id: 'karen-high-equity',
    label: 'Karen - High Equity',
    summary:
      'Karen is a 45-year-old experienced investor in QLD. Self-employed company, $175k + $95k investment income. 4 properties, $620k equity, $1.2M borrowing, $220k cash. Family trust structures. Full advisory team, SMSF $380k. Focus: development and subdivision in Brisbane metro. Aggressive risk.',
    agentBriefs: {
      baselineBen: 'Karen is experienced (8 years, 4 properties), QLD-based. Self-employed Pty Ltd $175k + $95k investment income. $620k equity, $1.2M borrowing, $220k cash. Moving into development/subdivision in Brisbane metro. Full advisory team, family trust structures, SMSF $380k. 1 dependent. Aggressive risk, 3-5 year active strategy.',
      finderFred: 'Karen wants development-grade sites in Brisbane metro and Gold Coast, budget up to $800k. Moving in 3 months. Pre-approved, $220k cash, $620k equity. Not open to interstate. Metro only. Owns in Newstead, Cannon Hill, Logan, Ipswich. Value-add/subdivision strategy. 8 years experience, has broker.',
      investorCoach: 'Karen earns $175k self-employed (Pty Ltd). $95k additional from shares and rent. PPOR $1.1M/$280k. Newstead unit $580k/$320k, $550/wk, family trust. Cannon Hill house $780k/$450k, $580/wk, family trust. Logan duplex $620k/$400k, $680/wk, family trust. Ipswich house $450k/$340k, $420/wk, personal. $620k equity, $1.2M borrowing, $220k cash. $7,900/mo expenses. No debts outside mortgages. Pre-approved. Goal: development and subdivision.',
      dealSpecialist: 'Karen has family trust holding 3 of 4 properties (Newstead, Cannon Hill, Logan). Ipswich in personal name. 45% marginal rate ($175k + $95k). Full advisory team: accountant, solicitor, financial planner. SMSF $380k. Not seeking new structures. 1 dependent. Self-employed Pty Ltd. Interested in structuring a subdivision JV.',
    },
  },
  {
    id: 'mike-cash-flow',
    label: 'Mike - Cash Flow Focused',
    summary:
      'Mike is a 52-year-old conservative investor in SA. Earns $95k PAYG. 1 investment property (Elizabeth SA) plus PPOR. $85k equity, $520k borrowing, $60k cash. Goal: passive income to replace salary in 15 years. Cash-flow strategy. Has broker and accountant.',
    agentBriefs: {
      baselineBen: 'Mike is 52, SA-based, conservative. $95k PAYG, 1 investment property plus PPOR. $85k equity, $520k borrowing, $60k cash. 15-year plan to replace salary with passive rental income. Cash-flow strategy. 4 years experience. Challenge: finding cash-flow-positive properties. Has broker and accountant. No dependents.',
      finderFred: 'Mike wants his 2nd property within 12 months, budget $400k. Cash-flow strategy - must be positive or close. Open to SA (Adelaide metro) and QLD (regional). Happy with regional. $60k cash, $85k equity. Owns in Elizabeth SA (house). Has broker. PAYG $95k, conservative risk.',
      investorCoach: 'Mike earns $95k PAYG, 15 years in role. PPOR $550k/$180k. Elizabeth SA house $380k/$260k, $370/wk, personal name. $85k equity, $520k borrowing, $60k cash. $5,200/mo expenses. $8k credit cards. No other debts. Goal: passive income to replace salary in 15 years. Conservative, cash-flow focused. Needs yield modelling for target.',
      dealSpecialist: 'Mike has everything in personal name. No trusts, companies, or SMSF. Not interested in restructuring. 32.5% marginal rate ($95k). Has accountant, no solicitor. No dependents. Conservative. Small portfolio - protection less urgent. May revisit as portfolio grows.',
    },
  },
  {
    id: 'linda-asset-protection',
    label: 'Linda - Structure & Protection',
    summary:
      'Linda is a 41-year-old investor in NSW. Earns $210k PAYG, partner $120k. 3 investment properties, all in personal/joint names. $450k equity, $950k borrowing, $150k cash. Primary concern: restructure into trusts for protection and tax optimisation. 45% marginal rate. Has accountant, no solicitor.',
    agentBriefs: {
      baselineBen: 'Linda is 41, NSW-based, $210k PAYG (partner $120k). 3 investment properties plus PPOR, all personal/joint names. $450k equity, $950k borrowing, $150k cash. Priority: restructure into trusts for asset protection and tax optimisation (45% rate). Has broker and accountant but no solicitor. 3 dependents. 6 years experience. Wants to fix structures while continuing to grow.',
      finderFred: 'Linda wants her 4th property within 3-6 months, budget $700k. Prefers NSW (Sydney metro, Central Coast) and south-east QLD. Open to interstate. $150k cash, $450k equity. Balanced strategy. Owns in Parramatta, Newcastle, Wollongong. Has broker. $210k + partner $120k. Note: restructuring in progress, new purchases may go into trust.',
      investorCoach: 'Linda earns $210k PAYG, partner $120k. PPOR $1.4M/$650k. Parramatta unit $650k/$480k, $520/wk, personal. Newcastle house $720k/$520k, $560/wk, joint. Wollongong townhouse $580k/$430k, $480/wk, personal. $450k equity, $950k borrowing, $150k cash. $25k car loan. $10k/mo expenses. $20k credit cards. 3 dependents. Goal: restructure and grow. Balanced strategy.',
      dealSpecialist: 'Linda has all properties in personal/joint names - no trusts, companies, or SMSF. This is her primary pain point. Wants to restructure for protection and tax (45% rate on $210k + $78k rental). Has accountant but NO solicitor or financial planner. 3 dependents, partner co-invests ($120k). Key question: moving existing properties into trusts (stamp duty, CGT implications). Parramatta (personal), Newcastle (joint), Wollongong (personal). 6 years experience.',
    },
  },
];

export function getProfile(id: string): EvalProfile | undefined {
  return EVAL_PROFILES.find((p) => p.id === id);
}
```

**Step 2: Commit**

```bash
git add packages/pipeline/src/pipeline/eval/profiles.ts
git commit -m "feat: add agent briefs to eval profiles for richer context testing"
```

---

### Task 9: Update evaluator to pass agent-specific briefs

**Files:**
- Modify: `packages/pipeline/src/pipeline/eval/evaluator.ts`

**Step 1: Update buildEvalPrompt to accept agent brief**

Replace the function signature and USER PROFILE section in `buildEvalPrompt` (line 50-54):

Old:
```typescript
function buildEvalPrompt(
  question: string,
  response: string,
  profileSummary: string,
  rubric: RubricCriteria
): string {
```

New:
```typescript
function buildEvalPrompt(
  question: string,
  response: string,
  profileSummary: string,
  rubric: RubricCriteria,
  agentBrief?: string
): string {
```

Replace the USER PROFILE section (line 77-78):

Old:
```
USER PROFILE:
${profileSummary}
```

New:
```
USER PROFILE:
${profileSummary}
${agentBrief ? `\nAGENT-SPECIFIC BRIEF PROVIDED TO THE AGENT:\n${agentBrief}` : ''}
```

**Step 2: Update evaluateResponse to accept agent brief**

Replace the function signature (line 110-114):

Old:
```typescript
export async function evaluateResponse(
  question: string,
  response: string,
  profileSummary: string,
  rubric: RubricCriteria
): Promise<EvalResult> {
```

New:
```typescript
export async function evaluateResponse(
  question: string,
  response: string,
  profileSummary: string,
  rubric: RubricCriteria,
  agentBrief?: string
): Promise<EvalResult> {
```

Update line 118 to pass the brief:

Old:
```typescript
  const evalPrompt = buildEvalPrompt(question, response, profileSummary, rubric);
```

New:
```typescript
  const evalPrompt = buildEvalPrompt(question, response, profileSummary, rubric, agentBrief);
```

**Step 3: Commit**

```bash
git add packages/pipeline/src/pipeline/eval/evaluator.ts
git commit -m "feat: pass agent-specific brief to evaluator for context-aware scoring"
```

---

### Task 10: Update any remaining references and verify build

**Files:**
- Check all imports/references across the codebase

**Step 1: Search for remaining FinancialPosition/useFinancialStore references**

Run: `grep -r "FinancialPosition\|useFinancialStore\|setPosition\|financialPosition" --include="*.ts" --include="*.tsx" packages/web/src/ | grep -v node_modules | grep -v ".d.ts"`

Fix any remaining references to use the new types. The deprecated aliases in `financial-store.ts` will catch most cases, but direct shape access (e.g. `.income`, `.expenses`, `.existingProperties`) will break and needs updating.

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/reidbates/dev/ilragents && npx tsc --noEmit --project packages/web/tsconfig.json`
Expected: No errors.

**Step 3: Verify pipeline compiles**

Run: `cd /Users/reidbates/dev/ilragents && npx tsc --noEmit --project packages/pipeline/tsconfig.json`
Expected: No errors.

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: update remaining references to use ClientProfile types"
```

---

### Task 11: Final integration check

**Step 1: Start the dev server**

Run: `cd /Users/reidbates/dev/ilragents && npm run dev`
Expected: Server starts without errors.

**Step 2: Verify test profiles load**

Open browser to the test profile selector (if there is one) and confirm all 5 profiles render with the new data.

**Step 3: Commit if any final fixes needed**

```bash
git add -A
git commit -m "fix: final integration fixes for client profile onboarding"
```
