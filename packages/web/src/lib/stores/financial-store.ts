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
  email?: string;
  phone?: string;
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
