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
    max_tokens: 4000,
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
    max_tokens: 4000,
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
