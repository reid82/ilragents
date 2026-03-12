"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type {
  ClientProfile,
  DebtItem,
  PropertySummary,
  AustralianState,
  EmploymentType,
  InvestmentGoalType,
  TimeHorizon,
  RiskTolerance,
  StrategyPreference,
  PropertyType,
  OwnershipStructure,
  ExperienceLevel,
  MarginalTaxRate,
} from "@/lib/stores/financial-store";

interface ProfileModalProps {
  profile: ClientProfile;
  onSave: (profile: ClientProfile) => void;
  onClose: () => void;
}

// Enum options
const STATES: AustralianState[] = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];
const EMPLOYMENT_TYPES: EmploymentType[] = [
  "payg-fulltime", "payg-parttime", "payg-casual",
  "self-employed-sole", "self-employed-company", "contractor", "mixed",
];
const GOAL_TYPES: InvestmentGoalType[] = [
  "first-property", "grow-portfolio", "passive-income",
  "development", "restructure", "retirement", "other",
];
const TIME_HORIZONS: TimeHorizon[] = [
  "under-1-year", "1-3-years", "3-5-years", "5-10-years", "10-plus-years",
];
const RISK_LEVELS: RiskTolerance[] = ["conservative", "moderate", "growth", "aggressive"];
const STRATEGIES: StrategyPreference[] = [
  "capital-growth", "cash-flow", "balanced", "value-add", "unsure",
];
const PROPERTY_TYPES: PropertyType[] = [
  "house", "townhouse", "unit-apartment", "duplex", "land", "commercial", "other",
];
const OWNERSHIP_STRUCTURES: OwnershipStructure[] = [
  "personal", "joint-personal", "family-trust", "unit-trust", "company", "smsf", "unknown",
];
const EXPERIENCE_LEVELS: ExperienceLevel[] = [
  "beginner", "some-knowledge", "owner-occupier", "novice-investor", "experienced", "advanced",
];
const TAX_RATES: MarginalTaxRate[] = ["under-32.5", "32.5", "37", "45", "unknown"];
const DEBT_TYPES: DebtItem["type"][] = ["car-loan", "personal-loan", "credit-card", "hecs", "other"];

function label(value: string): string {
  return value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Payg/g, "PAYG")
    .replace(/Hecs/g, "HECS")
    .replace(/Smsf/g, "SMSF");
}

const inputClass =
  "rounded-lg px-2 py-1 text-sm text-right w-40 focus:outline-none focus:ring-1 transition-colors";

const selectClass =
  "rounded-lg px-2 py-1 text-sm w-40 focus:outline-none focus:ring-1 transition-colors";

const inputStyle = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
};

const focusRing = 'focus:ring-emerald-500/50';

function TextRow({
  label: l,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{l}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} ${focusRing}`}
        style={inputStyle}
      />
    </div>
  );
}

function NumberRow({
  label: l,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  value: number | undefined | null;
  onChange: (v: number | undefined) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{l}</span>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{prefix}</span>}
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? undefined : Number(v));
          }}
          className={`${inputClass} ${focusRing}`}
          style={inputStyle}
        />
        {suffix && <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function SelectRow<T extends string>({
  label: l,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{l}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`${selectClass} ${focusRing}`}
        style={inputStyle}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {label(opt)}
          </option>
        ))}
      </select>
    </div>
  );
}

function BoolRow({
  label: l,
  value,
  onChange,
}: {
  label: string;
  value: boolean | undefined | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{l}</span>
      <div className="flex gap-1">
        <button
          onClick={() => onChange(true)}
          className="px-3 py-1 text-xs rounded-md transition-colors"
          style={{
            background: value === true ? 'var(--primary)' : 'var(--surface-2)',
            color: value === true ? 'white' : 'var(--text-secondary)',
            border: value === true ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          Yes
        </button>
        <button
          onClick={() => onChange(false)}
          className="px-3 py-1 text-xs rounded-md transition-colors"
          style={{
            background: value === false ? 'var(--primary)' : 'var(--surface-2)',
            color: value === false ? 'white' : 'var(--text-secondary)',
            border: value === false ? 'none' : '1px solid var(--border-subtle)',
          }}
        >
          No
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 last:mb-0">
      <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </h3>
      <div className="rounded-lg px-4 py-2" style={{ background: 'var(--surface-2)' }}>{children}</div>
    </div>
  );
}

function EditableDebtRow({
  debt,
  onChange,
}: {
  debt: DebtItem;
  onChange: (d: DebtItem) => void;
}) {
  return (
    <div className="py-2 space-y-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Type</span>
        <select
          value={debt.type}
          onChange={(e) => onChange({ ...debt, type: e.target.value as DebtItem["type"] })}
          className={`${selectClass} ${focusRing}`}
          style={inputStyle}
        >
          {DEBT_TYPES.map((t) => (
            <option key={t} value={t}>{label(t)}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Balance</span>
        <div className="flex items-center gap-1">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
          <input
            type="number"
            value={debt.balance ?? ""}
            onChange={(e) => onChange({ ...debt, balance: e.target.value === "" ? undefined : Number(e.target.value) })}
            className={`${inputClass} ${focusRing}`}
            style={inputStyle}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Monthly repayment</span>
        <div className="flex items-center gap-1">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
          <input
            type="number"
            value={debt.monthlyRepayment ?? ""}
            onChange={(e) => onChange({ ...debt, monthlyRepayment: e.target.value === "" ? undefined : Number(e.target.value) })}
            className={`${inputClass} ${focusRing}`}
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
}

function EditablePropertyRow({
  property,
  index,
  onChange,
}: {
  property: PropertySummary;
  index: number;
  onChange: (p: PropertySummary) => void;
}) {
  function upd(field: keyof PropertySummary, value: unknown) {
    onChange({ ...property, [field]: value });
  }

  return (
    <div className="py-2 space-y-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        Property {index + 1}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Location</span>
        <input
          type="text"
          value={property.location ?? ""}
          onChange={(e) => upd("location", e.target.value || undefined)}
          className={`${inputClass} ${focusRing}`}
          style={inputStyle}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Type</span>
        <select
          value={property.type ?? "house"}
          onChange={(e) => upd("type", e.target.value)}
          className={`${selectClass} ${focusRing}`}
          style={inputStyle}
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>{label(t)}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Value</span>
        <div className="flex items-center gap-1">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
          <input
            type="number"
            value={property.currentValue ?? ""}
            onChange={(e) => upd("currentValue", e.target.value === "" ? undefined : Number(e.target.value))}
            className={`${inputClass} ${focusRing}`}
            style={inputStyle}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Mortgage</span>
        <div className="flex items-center gap-1">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
          <input
            type="number"
            value={property.mortgageOwing ?? ""}
            onChange={(e) => upd("mortgageOwing", e.target.value === "" ? undefined : Number(e.target.value))}
            className={`${inputClass} ${focusRing}`}
            style={inputStyle}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Weekly rent</span>
        <div className="flex items-center gap-1">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
          <input
            type="number"
            value={property.weeklyRent ?? ""}
            onChange={(e) => upd("weeklyRent", e.target.value === "" ? undefined : Number(e.target.value))}
            className={`${inputClass} ${focusRing}`}
            style={inputStyle}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Structure</span>
        <select
          value={property.ownershipStructure ?? "personal"}
          onChange={(e) => upd("ownershipStructure", e.target.value)}
          className={`${selectClass} ${focusRing}`}
          style={inputStyle}
        >
          {OWNERSHIP_STRUCTURES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Year purchased</span>
        <input
          type="number"
          value={property.yearPurchased ?? ""}
          onChange={(e) => upd("yearPurchased", e.target.value === "" ? undefined : Number(e.target.value))}
          className={`${inputClass} ${focusRing}`}
          style={inputStyle}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Purchase price</span>
        <div className="flex items-center gap-1">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>$</span>
          <input
            type="number"
            value={property.purchasePrice ?? ""}
            onChange={(e) => upd("purchasePrice", e.target.value === "" ? undefined : Number(e.target.value))}
            className={`${inputClass} ${focusRing}`}
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
}

export default function ProfileModal({ profile, onSave, onClose }: ProfileModalProps) {
  const [draft, setDraft] = useState<ClientProfile>(() => structuredClone(profile));

  function upd<K extends keyof ClientProfile>(
    section: K,
    field: string,
    value: unknown
  ) {
    setDraft((prev) => ({
      ...prev,
      [section]: { ...(prev[section] as Record<string, unknown>), [field]: value },
    }));
  }

  function updProperty(index: number, property: PropertySummary) {
    setDraft((prev) => {
      const props = [...prev.portfolio.investmentProperties];
      props[index] = property;
      return { ...prev, portfolio: { ...prev.portfolio, investmentProperties: props } };
    });
  }

  function updDebt(index: number, debt: DebtItem) {
    setDraft((prev) => {
      const debts = [...(prev.financial.existingDebts ?? [])];
      debts[index] = debt;
      return { ...prev, financial: { ...prev.financial, existingDebts: debts } };
    });
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  const { personal, employment, financial, portfolio, goals, locationPrefs, taxAndStructure, experience } = draft;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{
          background: 'var(--surface-0)',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="text-lg font-semibold text-white">My Financial Position</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Section title="Personal">
            <TextRow label="Name" value={personal.firstName} onChange={(v) => upd("personal", "firstName", v)} />
            <NumberRow label="Age" value={personal.age} onChange={(v) => upd("personal", "age", v)} />
            <SelectRow label="State" value={personal.state} options={STATES} onChange={(v) => upd("personal", "state", v)} />
            <NumberRow label="Dependents" value={personal.dependents} onChange={(v) => upd("personal", "dependents", v)} />
            <BoolRow label="Partner investing" value={personal.partnerInvesting} onChange={(v) => upd("personal", "partnerInvesting", v)} />
            <NumberRow label="Partner income" value={personal.partnerIncome} onChange={(v) => upd("personal", "partnerIncome", v)} prefix="$" />
          </Section>

          <Section title="Income & Employment">
            <NumberRow label="Gross annual income" value={employment.grossAnnualIncome} onChange={(v) => upd("employment", "grossAnnualIncome", v ?? 0)} prefix="$" />
            <SelectRow label="Employment type" value={employment.employmentType} options={EMPLOYMENT_TYPES} onChange={(v) => upd("employment", "employmentType", v)} />
            <NumberRow label="Years in role" value={employment.yearsInRole} onChange={(v) => upd("employment", "yearsInRole", v)} />
            <BoolRow label="HECS/HELP" value={employment.hasHecsHelp} onChange={(v) => upd("employment", "hasHecsHelp", v)} />
            {employment.hasHecsHelp && (
              <NumberRow label="HECS balance" value={employment.hecsBalance} onChange={(v) => upd("employment", "hecsBalance", v)} prefix="$" />
            )}
            <TextRow label="Other income streams" value={employment.otherIncomeStreams ?? ""} onChange={(v) => upd("employment", "otherIncomeStreams", v || undefined)} />
            <NumberRow label="Other income amount" value={employment.otherIncomeAmount} onChange={(v) => upd("employment", "otherIncomeAmount", v)} prefix="$" />
          </Section>

          <Section title="Financial Position">
            <NumberRow label="Cash savings" value={financial.cashSavings} onChange={(v) => upd("financial", "cashSavings", v)} prefix="$" />
            <NumberRow label="Monthly expenses" value={financial.monthlyExpenses} onChange={(v) => upd("financial", "monthlyExpenses", v)} prefix="$" />
            <NumberRow label="Borrowing capacity" value={financial.borrowingCapacity} onChange={(v) => upd("financial", "borrowingCapacity", v)} prefix="$" />
            <NumberRow label="Credit card limits" value={financial.creditCardLimits} onChange={(v) => upd("financial", "creditCardLimits", v)} prefix="$" />
            <BoolRow label="Has broker" value={financial.hasBroker} onChange={(v) => upd("financial", "hasBroker", v)} />
            <BoolRow label="Pre-approval" value={financial.hasPreApproval} onChange={(v) => upd("financial", "hasPreApproval", v)} />
            {financial.existingDebts && financial.existingDebts.length > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Debts</div>
                {financial.existingDebts.map((d, i) => (
                  <EditableDebtRow key={i} debt={d} onChange={(updated) => updDebt(i, updated)} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Property Portfolio">
            <BoolRow label="Owns home" value={portfolio.ownsHome} onChange={(v) => upd("portfolio", "ownsHome", v)} />
            {portfolio.ownsHome && (
              <>
                <NumberRow label="Home value" value={portfolio.homeValue} onChange={(v) => upd("portfolio", "homeValue", v)} prefix="$" />
                <NumberRow label="Home mortgage" value={portfolio.homeMortgage} onChange={(v) => upd("portfolio", "homeMortgage", v)} prefix="$" />
              </>
            )}
            <NumberRow label="Total equity" value={portfolio.totalEquity} onChange={(v) => upd("portfolio", "totalEquity", v)} prefix="$" />
            {portfolio.investmentProperties.length > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Investment Properties</div>
                {portfolio.investmentProperties.map((p, i) => (
                  <EditablePropertyRow key={i} property={p} index={i} onChange={(updated) => updProperty(i, updated)} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Investment Goals">
            <SelectRow label="Primary goal" value={goals.primaryGoal} options={GOAL_TYPES} onChange={(v) => upd("goals", "primaryGoal", v)} />
            <TextRow label="Goal detail" value={goals.goalDetail ?? ""} onChange={(v) => upd("goals", "goalDetail", v || undefined)} />
            <SelectRow label="Time horizon" value={goals.timeHorizon} options={TIME_HORIZONS} onChange={(v) => upd("goals", "timeHorizon", v)} />
            <SelectRow label="Risk tolerance" value={goals.riskTolerance} options={RISK_LEVELS} onChange={(v) => upd("goals", "riskTolerance", v)} />
            <SelectRow label="Strategy" value={goals.strategyPreference ?? "unsure"} options={STRATEGIES} onChange={(v) => upd("goals", "strategyPreference", v)} />
            <TextRow label="Next step timeline" value={goals.nextStepTimeline ?? ""} onChange={(v) => upd("goals", "nextStepTimeline", v || undefined)} />
            <NumberRow label="Budget for next purchase" value={goals.budgetForNextPurchase} onChange={(v) => upd("goals", "budgetForNextPurchase", v)} prefix="$" />
          </Section>

          <Section title="Location Preferences">
            <TextRow
              label="Preferred states"
              value={locationPrefs?.preferredStates?.join(", ") ?? ""}
              onChange={(v) => {
                const states = v.split(",").map((s) => s.trim()).filter(Boolean) as AustralianState[];
                setDraft((prev) => ({
                  ...prev,
                  locationPrefs: { ...prev.locationPrefs, preferredStates: states.length ? states : undefined },
                }));
              }}
            />
            <TextRow
              label="Preferred regions"
              value={locationPrefs?.preferredRegions?.join(", ") ?? ""}
              onChange={(v) => {
                const regions = v.split(",").map((s) => s.trim()).filter(Boolean);
                setDraft((prev) => ({
                  ...prev,
                  locationPrefs: { ...prev.locationPrefs, preferredRegions: regions.length ? regions : undefined },
                }));
              }}
            />
            <BoolRow
              label="Open to interstate"
              value={locationPrefs?.openToInterstate}
              onChange={(v) => setDraft((prev) => ({ ...prev, locationPrefs: { ...prev.locationPrefs, openToInterstate: v } }))}
            />
            <TextRow
              label="Proximity preference"
              value={locationPrefs?.proximityPreference ?? ""}
              onChange={(v) => setDraft((prev) => ({ ...prev, locationPrefs: { ...prev.locationPrefs, proximityPreference: v || undefined } }))}
            />
          </Section>

          <Section title="Tax & Structure">
            <SelectRow
              label="Marginal tax rate"
              value={taxAndStructure?.marginalTaxRate ?? "unknown"}
              options={TAX_RATES}
              onChange={(v) => setDraft((prev) => ({ ...prev, taxAndStructure: { ...prev.taxAndStructure, marginalTaxRate: v } }))}
            />
            <BoolRow
              label="Has accountant"
              value={taxAndStructure?.hasAccountant}
              onChange={(v) => setDraft((prev) => ({ ...prev, taxAndStructure: { ...prev.taxAndStructure, hasAccountant: v } }))}
            />
            <BoolRow
              label="Has solicitor"
              value={taxAndStructure?.hasSolicitor}
              onChange={(v) => setDraft((prev) => ({ ...prev, taxAndStructure: { ...prev.taxAndStructure, hasSolicitor: v } }))}
            />
            <BoolRow
              label="Has financial planner"
              value={taxAndStructure?.hasFinancialPlanner}
              onChange={(v) => setDraft((prev) => ({ ...prev, taxAndStructure: { ...prev.taxAndStructure, hasFinancialPlanner: v } }))}
            />
            <BoolRow
              label="Has SMSF"
              value={taxAndStructure?.hasSMSF}
              onChange={(v) => setDraft((prev) => ({ ...prev, taxAndStructure: { ...prev.taxAndStructure, hasSMSF: v } }))}
            />
            {taxAndStructure?.hasSMSF && (
              <NumberRow
                label="SMSF balance"
                value={taxAndStructure?.smsfBalance}
                onChange={(v) => setDraft((prev) => ({ ...prev, taxAndStructure: { ...prev.taxAndStructure, smsfBalance: v } }))}
                prefix="$"
              />
            )}
          </Section>

          <Section title="Experience">
            <SelectRow
              label="Level"
              value={experience?.investingExperience ?? "beginner"}
              options={EXPERIENCE_LEVELS}
              onChange={(v) => setDraft((prev) => ({ ...prev, experience: { ...prev.experience, investingExperience: v } as ClientProfile["experience"] }))}
            />
            <NumberRow
              label="Years investing"
              value={experience?.yearsInvesting}
              onChange={(v) => setDraft((prev) => ({ ...prev, experience: { ...prev.experience, investingExperience: prev.experience?.investingExperience ?? "beginner", yearsInvesting: v } }))}
            />
            <TextRow
              label="Biggest challenge"
              value={experience?.biggestChallenge ?? ""}
              onChange={(v) => setDraft((prev) => ({ ...prev, experience: { ...prev.experience, investingExperience: prev.experience?.investingExperience ?? "beginner", biggestChallenge: v || undefined } }))}
            />
          </Section>

          {/* Completeness */}
          <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {(() => {
              const pct = draft.completenessScore > 1
                ? Math.min(draft.completenessScore, 100)
                : Math.round(draft.completenessScore * 100);
              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Profile completeness</span>
                    <span className="text-sm font-medium text-white">{pct}%</span>
                  </div>
                  <div className="w-full rounded-full h-2" style={{ background: 'var(--surface-3)' }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${pct}%`, background: 'var(--primary)' }}
                    />
                  </div>
                </>
              );
            })()}
            {draft.dataGaps.length > 0 && (
              <div className="mt-3">
                <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  Talk to Ben to fill in these gaps:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {draft.dataGaps.map((gap, i) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--surface-2)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {gap}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex justify-end gap-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-sm text-white rounded-lg font-medium transition-all"
            style={{
              background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
